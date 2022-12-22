const mongoose = require("mongoose")

const schema = mongoose.Schema({
  query: String,
  status: String,
  country: String,
  countryCode: String,
  region: String,
  regionName: String,
  city: String,
  zip: String,
  lat: Number,
  lon: Number,
  timezone: String,
  isp: String,
  org: String,
  as: String,
  page: String,
  ts: Number,
})

mongoModelTraffic = mongoose.model("Traffic", schema)
module.exports = mongoModelTraffic
