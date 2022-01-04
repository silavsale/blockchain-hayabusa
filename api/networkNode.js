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
  const newTransaction = req.body
  const blockIndex = bitcoin.addTransactionToPendingTransactions(newTransaction)

  res.json({ note: `Transaction will be added to block ${blockIndex}.` })
})

// route to create a new transaction with transaction id
app.post("/transaction/broadcast", function (req, res) {
  const { amount, sender, recipient } = req.body
  console.log("amount", amount)
  const newTransaction = bitcoin.createNewTransaction(amount, sender, recipient)
  bitcoin.addTransactionToPendingTransactions(newTransaction)

  const requestPromises = []
  bitcoin.networkNodes.forEach((networkNodeUrl) => {
    const requestOptions = {
      uri: networkNodeUrl + "/transaction",
      method: "POST",
      body: newTransaction,
      json: true,
    }
    requestPromises.push(rp(requestOptions))
  })

  Promise.all(requestPromises)
    .then((data) => {
      res.json({ note: "Transaction created and broadcast successfully." })
    })
    .catch((err) => console.log(err))
})

// mine a block
app.get("/mine", function (req, res) {
  console.log("mine")
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

  const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, blockHash)

  const requestPromises = []
  bitcoin.networkNodes.forEach((networkNodeUrl) => {
    const requestOptions = {
      uri: networkNodeUrl + "/receive-new-block",
      method: "POST",
      body: {
        newBlock: newBlock,
      },
      json: true,
    }

    requestPromises.push(rp(requestOptions))
  })

  Promise.all(requestPromises)
    .then((data) => {
      const requestOptions = {
        uri: bitcoin.currentNodeUrl + "/transaction/broadcast",
        method: "POST",
        body: {
          amount: 12.5,
          sender: "00",
          recipient: nodeAddress,
        },
        json: true,
      }

      return rp(requestOptions)
    })
    .then((data) => {
      res.json({
        note: "New block mined & broadcast successfully",
        block: newBlock,
      })
    })
    .catch((err) => console.log(err))
})

app.post("/receive-new-block", function (req, res) {
  const newBlock = req.body.newBlock
  const lastBlock = bitcoin.getLastBlock()
  const correctHash = lastBlock.hash === newBlock.previousBlockHash
  const correctIndex = lastBlock["index"] + 1 === newBlock["index"]
  console.log("receive-new-block")

  if (correctIndex && correctHash) {
    bitcoin.chain.push(newBlock)
    bitcoin.pendingTransactions = []
    res.json({ note: "New block recieved and accepted", newBlock: newBlock })
  } else {
    res.json({ note: "The block was not received", newBlock: newBlock })
  }
})

// register a node and broadcast it the network
app.post("/register-and-broadcast-node", function (req, res) {
  const newNodeUrl = req.body.newNodeUrl
  const notCurrentNode = bitcoin.currentNodeUrl === newNodeUrl

  if (notCurrentNode) {
    return res.json({
      note: "Node cannot add itself to the list of network nodes",
    })
  } else if (bitcoin.networkNodes.indexOf(newNodeUrl) === -1) {
    bitcoin.networkNodes.push(newNodeUrl)
  } else {
    return res.json({ note: `The node ${newNodeUrl} already exists` })
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

  if (nodeNotAlreadyExist && notCurrentNode) {
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

    if (nodeNotAlreadyExist && notCurrentNode) {
      bitcoin.networkNodes.push(networkNodeUrl)
    }
  })

  res.json({ note: "Bulk registration successful." })
})

app.get("/consensus", function (req, res) {
  const requestPromises = []
  bitcoin.networkNodes.forEach((networkNodeUrl) => {
    const requestOptions = {
      uri: networkNodeUrl + "/blockchain",
      method: "GET",
      json: true,
    }
    requestPromises.push(rp(requestOptions))
  })

  Promise.all(requestPromises).then((blockchains) => {
    const curentChainLength = bitcoin.chain.length
    let maxChainLength = curentChainLength
    let newLongestChain = null
    let newPandingTransactions = null
    blockchains.forEach((blockchain) => {
      if (blockchain.chain.length > maxChainLength) {
        maxChainLength = blockchain.chain.length
        newLongestChain = blockchain.chain
        newPandingTransactions = blockchain.pendingTransactions
      }
    })

    if (
      !newLongestChain ||
      (newLongestChain && !bitcoin.chainIsValid(newLongestChain))
    ) {
      res.json({
        note: "Current chain has not been replaced.",
        chain: bitcoin.chain,
      })
      // meening of else = (newLongestChain && bitcoin.chainIsValid(newLongestChain))
    } else {
      bitcoin.chain = newLongestChain
      bitcoin.pendingTransactions = newPandingTransactions
      res.json({
        note: "This chain has been replaced.",
        chain: bitcoin.chain,
      })
    }
  })
})

app.get("/block/:blockHash", function (req, res) {
  const blockHash = req.params.blockHash
  console.log("blockHash", blockHash)
  const correctBlock = bitcoin.getBlock(blockHash)
  console.log("correctBlock", correctBlock)

  res.json({ block: correctBlock })
})

app.get("/transaction/:transactionId", function (req, res) {
  const transactionId = req.params.transactionId
  const transactionData = bitcoin.getTransaction(transactionId)
  res.json({
    transaction: transactionData.transaction,
    block: transactionData.block,
  })
})

app.get("/address/:address", function (req, res) {
  const address = req.params.address
  const addressData = bitcoin.getAddressData(address)
  res.json({
    addressData: addressData,
  })
})

app.listen(PORT, function () {
  console.log(`Listening on port ${PORT}...`)
})
