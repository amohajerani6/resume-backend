const fs = require("fs")
const { uploadFile, getFileStream, deleteFileS3 } = require("./s3")
const express = require("express")
var jwt = require("jsonwebtoken")
var fileupload = require("express-fileupload")
require("dotenv").config()
const bcrypt = require("bcrypt")
const mongoose = require("mongoose")
const cors = require("cors")
const requestIp = require("request-ip")
const request = require("request")
const app = express()
app.use(fileupload())
app.use(requestIp.mw())
app.use(cors())
const mongoModelPages = require("./mongoModelPages")
const mongoModelAccounts = require("./mongoModelAccounts")
const mongoModelTraffic = require("./mongoModelTraffic")
app.use(express.json())

const dbLink = process.env.dbLink

let refreshTokens = []
mongoose.connect(dbLink + "/resume?retryWrites=true&w=majority", {
  useNewUrlParser: true,
})

const verify = (req, res, next) => {
  const authHeader = req.headers.authorization
  if (authHeader) {
    const token = authHeader.split(" ")[1]
    jwt.verify(token, process.env.TOKENSECRET, (err, user) => {
      if (err) {
        return res.status(403).json("Token is not valid!")
        // SEND THIS TO LOGIN PAGE
      }
      req.username = user.username
      req.name = user.name

      next()
    })
  } else {
    res.status(401).json("You are not authenticated!")
  }
}

app.get("/", verify, async function (req, res) {
  try {
    var queryResults = await mongoModelPages.find({ username: req.username })
    res.send(JSON.stringify(queryResults))
  } catch (err) {
    console.log("error in adding data", err)
  }
})

app.post("/create-page", verify, async function (req, res) {
  var username = req.username
  let file = req.files.file
  let page = req.body.page
  var record = await mongoModelPages.findOne({
    page: page,
  })
  if (!record || record.username == req.username) {
    const path = "./files/" + req.body.page + ".pdf"
    file.mv(path)
    // move the file to s3
    await uploadFile(path, req.body.page + ".pdf")
    // delete the file
    fs.unlink(__dirname + "/files/" + page + ".pdf", (err) => {
      if (err) {
        throw err
      }
    })
    // update mongodb
    await mongoModelPages.find({ page: page }).remove().exec()
    var newPage = new mongoModelPages({
      page: page,
      username: username,
    })
    await newPage.save()
    res.send({ created: true })
  } else {
    res.send("page exists and it is not yours")
  }
})

app.delete("/dash/:page", verify, async function (req, res) {
  let page = req.params.page
  var record = await mongoModelPages.findOne({
    page: page,
  })
  if (!record || record.username == req.username) {
    // remove file from S3
    await deleteFileS3(page)
    await mongoModelPages.find({ page: page }).remove().exec()

    res.send({ deleted: true })
  } else {
    res.send("page exists and it is not yours")
  }
})

const getTraffic = async function (page) {
  var traffic = await mongoModelTraffic.find({
    page: page,
  })
  if (!traffic) {
    return ""
  } else {
    return traffic
  }
}

app.get("/dash/:page", verify, async function (req, res) {
  let page = req.params.page
  var record = await mongoModelPages.findOne({
    page: page,
  })
  if (!record) {
    res.send("This page does not exist")
  } else if (record.username !== req.username) {
    res.send("You are not authorized to see this page")
  } else {
    // Get the traffic info
    var traffic = await getTraffic(page)
    var json = JSON.stringify({
      page: record["page"],
      username: record["username"],
      traffic: traffic,
    })
    res.send(json)
  }
})

app.get("/:page", async function (req, res) {
  let page = req.params.page
  var ip = req.clientIp
  request("http://ip-api.com/json/" + ip, { json: true }, (err, res, body) => {
    if (err) {
      return console.log(err)
    }
    body["page"] = page
    body["ts"] = Date.now()
    var newTraffic = new mongoModelTraffic(body)
    newTraffic.save()
    console.log(Date())
  })
  console.log("execute the S3 stuff")
  const readStream = getFileStream(page) // Pipe the file directly to the client
  readStream.pipe(res)
  // res.sendFile(__dirname + "/files/" + page + ".pdf")
})

function generateToken(name, username) {
  var token = jwt.sign(
    {
      name: name,
      username: username,
      exp: Math.floor(Date.now() / 1000) + +60 * 60 * 24,
    },
    process.env.TOKENSECRET
  )
  return token
}

function generateRefreshToken(name, username) {
  var token = jwt.sign(
    {
      name: name,
      username: username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 2,
    },
    process.env.REFRESHTOKENSECRET
  )
  refreshTokens.push(token)
  return token
}

app.post("/login", async function (req, res) {
  async function findUser(username, password) {
    var dbAccount = await mongoModelAccounts.findOne({
      username: username,
    })
    if (dbAccount) {
      bcrypt.compare(password, dbAccount.password, function (err, result) {
        if (result) {
          console.log("Account verified")
          var token = generateToken(dbAccount.name, dbAccount.username)
          var refreshToken = generateRefreshToken(
            dbAccount.name,
            dbAccount.username
          )
          res.json({
            name: dbAccount.name,
            username: dbAccount.username,
            token: token,
            refreshToken: refreshToken,
          })
        } else {
          console.log("Wrong password")
        }
      })
    } else console.log("Wrong credentials")
  }
  findUser(req.body.username, req.body.password)
})

app.post("/register", function (req, res) {
  bcrypt.hash(req.body.password, 5, function (err, hash) {
    // add to the db
    var newAccount = new mongoModelAccounts({
      name: req.body.name,
      username: req.body.username,
      password: hash,
    })
    try {
      newAccount.save()
      res.json({ registered: true })
    } catch (err) {
      console.log("error in adding new user", err)
    }
  })
})

app.post("/logout", function (req, res) {
  var refreshToken = req.body.refreshToken
  refreshTokens = refreshTokens.filter((token) => token !== refreshToken)
  res.send("logged out")
})

app.post("/refresh", (req, res) => {
  const refreshToken = req.body.refreshToken
  if (!refreshToken) {
    console.log("401 error here")
    return res.status(401).json("You are not authenticated!")
  }
  if (!refreshTokens.includes(refreshToken)) {
    console.log("403 error here")
    return res.status(403).json("Refresh token is not valid!")
  }
  jwt.verify(refreshToken, process.env.REFRESHTOKENSECRET, (err, user) => {
    err && console.log(err)
    refreshTokens = refreshTokens.filter((token) => token !== refreshToken)

    const newAccessToken = generateToken(user.name, user.username)
    const newRefreshToken = generateRefreshToken(user.name, user.username)

    res.status(200).json({
      name: user.name,
      username: user.username,
      token: newAccessToken,
      refreshToken: newRefreshToken,
    })
  })
})

app.listen(3001, console.log("server running on port 3001"))
