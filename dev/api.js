const express = require("express")
require("dotenv").config()
const app = express()
const bodyParser = require("body-parser")
const Blockchain = require("./blockchain")
const { v4: uuidv4 } = require("uuid")

const nodeAddress = uuidv4().split("-").join("")

const bitcoin = new Blockchain()

const PORT = process.env.PORT || 5000

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

// get entire blockchain
app.get("/blockchain", function (req, res) {
  res.send(bitcoin)
})

// create a new transaction
app.post("/transaction", function (req, res) {
  const { amount, sender, recipient } = req.body
  const blockIndex = bitcoin.createNewTransaction(amount, sender, recipient)
  console.log({ amount, sender, recipient })
  res.json({ node: `Transaction will be added in block ${blockIndex}` })
})

// mine a block
app.get("/mine", function (req, res) {
  const lastBlock = bitcoin.getLastBlock()
  const previousBlockHash = lastBlock["hash"]
  const currentBlockData = {
    transaction: bitcoin.pendingTransactions,
    index: lastBlock["index"] + 1,
  }

  const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData)

  const blockHash = bitcoin.hashBlock(
    previousBlockHash,
    currentBlockData,
    nonce
  )

  bitcoin.createNewTransaction(12.5, "00", nodeAddress)

  const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, blockHash)

  res.json({
    note: "New block mined successfully",
    block: newBlock,
  })
})

app.listen(PORT, function () {
  console.log(`Listening on port ${PORT}...`)
})
