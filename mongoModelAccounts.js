const mongoose = require("mongoose")

const schema = mongoose.Schema({
  username: String,
  password: String,
})

mongoModelAccounts = mongoose.model("Accounts", schema)
module.exports = mongoModelAccounts
