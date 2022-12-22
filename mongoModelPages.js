const mongoose = require("mongoose")

const schema = mongoose.Schema({
  page: String,
  username: String,
})

mongoModelPages = mongoose.model("Pages", schema)
module.exports = mongoModelPages
