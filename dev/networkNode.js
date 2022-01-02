const express = require("express")
require("dotenv").config()
const app = express()
const bodyParser = require("body-parser")
const Blockchain = require("./blockchain")
const { v4: uuidv4 } = require("uuid")
const rp = require("request-promise")

const PORT = process.argv[2]

const nodeAddress = uuidv4().split("-").join("")

const bitcoin = new Blockchain()

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

// register a node and broadcast it the network
app.post("/register-and-broadcast-node", function (req, res) {
  const newNodeUrl = req.body.newNodeUrl

  if (bitcoin.networkNodes.indexOf(newNodeUrl) === -1) {
    bitcoin.networkNodes.push(newNodeUrl)
  }

  const regNodesPromises = []

  bitcoin.networkNodes.forEach((networkNodeUrl) => {
    const requestOptions = {
      uri: networkNodeUrl + "/register-node",
      method: "POST",
      body: { newNodeUrl: newNodeUrl },
      json: true,
    }

    regNodesPromises.push(rp(requestOptions))
  })

  Promise.all(regNodesPromises)
    .then((data) => {
      const bulkRegisterOptions = {
        uri: newNodeUrl + "/register-node-bulk",
        method: "POST",
        body: {
          allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl],
        },
        json: true,
      }
      console.log("newNodeUrl", newNodeUrl)
      return rp(bulkRegisterOptions)
    })
    .then((data) => {
      res.json({ note: "New node registered wtih network successfully." })
    })
})

// register a node with the network
app.post("/register-node", function (req, res) {
  const newNodeUrl = req.body.newNodeUrl
  const nodeNotAlreadyExist = bitcoin.networkNodes.indexOf(newNodeUrl) === -1
  const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl
  // console.log("newNodeUrl", newNodeUrl)
  // console.log("notCurrentNode", notCurrentNode)
  if (nodeNotAlreadyExist && notCurrentNode) {
    // console.log(`newNodeUrl: ${newNodeUrl}`)
    bitcoin.networkNodes.push(newNodeUrl)
  }
  res.json({ note: "New node registered successfully." })
})

// register multiple nodes at once
app.post("/register-node-bulk", function (req, res) {
  const allNetworkNodes = req.body.allNetworkNodes

  allNetworkNodes.forEach((networkNodeUrl) => {
    const nodeNotAlreadyExist =
      bitcoin.networkNodes.indexOf(networkNodeUrl) === -1
    const notCurrentNode = bitcoin.currentNodeUrl !== networkNodeUrl
    console.log("bitcoin.currentNodeUrl", bitcoin.currentNodeUrl)
    console.log("networkNodeUrl", networkNodeUrl)
    console.log("notCurrentNode", notCurrentNode)
    if (nodeNotAlreadyExist && notCurrentNode) {
      bitcoin.networkNodes.push(networkNodeUrl)
    }
  })

  res.json({ note: "Bulk registration successful." })
})

app.listen(PORT, function () {
  console.log(`Listening on port ${PORT}...`)
})
