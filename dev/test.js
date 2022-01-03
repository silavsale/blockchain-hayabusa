const Blockchain = require("./blockchain")
let bc1 = require("./bc1.json")

const bitcoin = new Blockchain()

console.log("Valid:", bitcoin.chainIsValid(bc1.chain))
