const S3 = require("aws-sdk/clients/s3")
const fs = require("fs")
require("dotenv").config()

const region = "us-east-1"
const accessKeyId = process.env.S3ACCESSKEYID
const secretAccessKey = process.env.S3ACCESSKEY

const s3 = new S3({
  region: region,
  accessKeyId: accessKeyId,
  secretAccessKey: secretAccessKey,
})

// upload to S3
function uploadFile(path, filename) {
  const fileStream = fs.createReadStream(path)
  uploadParams = {
    Bucket: "gagali",
    Body: fileStream,
    Key: filename,
  }
  return s3.upload(uploadParams).promise()
}

// download from S3
function getFileStream(key) {
  downloadParams = {
    Bucket: "gagali",
    Key: key + ".pdf",
  }
  return s3.getObject(downloadParams).createReadStream()
}

// Delete filr from S3
function deleteFileS3(key) {
  console.log(key, " was inputed")
  return s3.deleteObject(
    { Bucket: "gagali", Key: key + ".pdf" },
    function (err, data) {
      if (err) {
        console.log(err)
      } else {
        console.log(data)
      }
    }
  )
}

module.exports = { uploadFile, getFileStream, deleteFileS3 }
