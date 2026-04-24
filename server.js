require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory nano transaction ledger
const nanoLedger = [];
let totalRequests = 0;
let totalEarned = 0;

// FX Rates (mock + live simulation)
const FX_RATES = {
  'USDC/EURC': 0.9245,
  'EURC/USDC': 1.0817,
  'USDC/GBPC': 0.7923,
  'GBPC/USDC': 1.2622,
  'USDC/USDT': 1.0001,
  'USDT/USDC': 0.9999,
  'EURC/GBPC': 0.8571,
  'GBPC/EURC': 1.1667,
  'USDC/BRLA': 5.2341,
  'BRLA/USDC': 0.1910
};

// Simulate live rate drift
function getLiveRate(pair) {
  const base = FX_RATES[pair] || 1;
  const drift = (Math.random() - 0.5) * 0.002;
  return parseFloat((base + drift).toFixed(6));
}

// x402 Nanopayment middleware
function requireNanoPayment(req, res, next) {
  const payment = req.headers['x-payment-signature'] ||
                  req.headers['x-nano-payment'] ||
                  req.query.payment;

  const NANO_PRICE = parseFloat(process.env.NANO_PRICE || 0.001);

  if (!payment) {
    // Return 402 Payment Required with payment details
    return res.status(402).json({
      error: 'Payment Required',
      protocol: 'x402',
      price: NANO_PRICE,
      currency: 'USDC',
      chain: 'Arc_Testnet',
      recipient: '0xStableFXTreasury',
      description: `${NANO_PRICE} USDC per FX rate request`,
      instructions: 'Include x-payment-signature header with USDC payment proof'
    });
  }

  // Record nano payment
  const txRecord = {
    id: 'nano_' + Date.now(),
    timestamp: new Date().toISOString(),
    pair: req.query.pair || req.params.pair || 'ALL',
    amount: NANO_PRICE,
    currency: 'USDC',
    chain: 'Arc_Testnet',
    paymentSig: payment.slice(0, 20) + '...',
    status: 'settled',
    txHash: '0x' + Math.random().toString(16).slice(2, 14) +
            Math.random().toString(16).slice(2, 14)
  };

  nanoLedger.unshift(txRecord);
  totalRequests++;
  totalEarned += NANO_PRICE;

  req.nanoTx = txRecord;
  next();
}

// ── ROUTES ──────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'StableFX Nano',
    version: '1.0.0',
    kit: 'arc-app-kit',
    time: new Date().toISOString()
  });
});

// Free: Get all available pairs
app.get('/api/pairs', (req, res) => {
  res.json({
    pairs: Object.keys(FX_RATES),
    price_per_request: parseFloat(process.env.NANO_PRICE || 0.001),
    currency: 'USDC',
    chain: 'Arc_Testnet',
    protocol: 'x402'
  });
});

// PAID: Get single pair rate — costs $0.001 USDC
app.get('/api/rate/:pair', requireNanoPayment, (req, res) => {
  const pair = req.params.pair.toUpperCase();
  const rate = getLiveRate(pair);
  if (!rate) {
    return res.status(404).json({ error: 'Pair not found' });
  }
  res.json({
    pair,
    rate,
    timestamp: new Date().toISOString(),
    source: 'StableFX Nano',
    chain: 'Arc_Testnet',
    tx: req.nanoTx,
    cost: parseFloat(process.env.NANO_PRICE || 0.001) + ' USDC'
  });
});

// PAID: Get all rates at once — costs $0.001 USDC
app.get('/api/rates/all', requireNanoPayment, (req, res) => {
  const rates = {};
  Object.keys(FX_RATES).forEach(pair => {
    rates[pair] = getLiveRate(pair);
  });
  res.json({
    rates,
    count: Object.keys(rates).length,
    timestamp: new Date().toISOString(),
    tx: req.nanoTx,
    cost: parseFloat(process.env.NANO_PRICE || 0.001) + ' USDC'
  });
});

// PAID: AI rate prediction — costs $0.001 USDC
app.get('/api/predict/:pair', requireNanoPayment, (req, res) => {
  const pair = req.params.pair.toUpperCase();
  const current = getLiveRate(pair);
  const trend = (Math.random() - 0.48) * 0.01;
  const prediction = parseFloat((current + trend).toFixed(6));
  const confidence = Math.floor(70 + Math.random() * 25);
  res.json({
    pair,
    current_rate: current,
    predicted_rate: prediction,
    direction: trend > 0 ? 'UP' : 'DOWN',
    change_pct: ((trend / current) * 100).toFixed(4) + '%',
    confidence: confidence + '%',
    horizon: '1 hour',
    timestamp: new Date().toISOString(),
    tx: req.nanoTx,
    cost: parseFloat(process.env.NANO_PRICE || 0.001) + ' USDC'
  });
});

// Dashboard stats
app.get('/api/stats', (req, res) => {
  res.json({
    total_requests: totalRequests,
    total_earned: totalEarned.toFixed(4),
    currency: 'USDC',
    avg_per_request: process.env.NANO_PRICE || 0.001,
    ledger_count: nanoLedger.length,
    uptime: process.uptime().toFixed(0) + 's',
    chain: 'Arc_Testnet'
  });
});

// Nano ledger
app.get('/api/ledger', (req, res) => {
  res.json({
    transactions: nanoLedger.slice(0, 50),
    total: nanoLedger.length,
    total_earned: totalEarned.toFixed(6) + ' USDC'
  });
});

// Simulate 50+ nano transactions for demo
app.post('/api/demo/simulate', (req, res) => {
  const pairs = Object.keys(FX_RATES);
  const count = req.body.count || 55;
  for (let i = 0; i < count; i++) {
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    const types = ['rate', 'predict', 'rates/all'];
    const type = types[Math.floor(Math.random() * types.length)];
    const ago = Math.floor(Math.random() * 3600000);
    nanoLedger.push({
      id: 'nano_' + (Date.now() - ago),
      timestamp: new Date(Date.now() - ago).toISOString(),
      pair,
      type,
      amount: 0.001,
      currency: 'USDC',
      chain: 'Arc_Testnet',
      paymentSig: '0x' + Math.random().toString(16).slice(2, 12) + '...',
      status: 'settled',
      txHash: '0x' + Math.random().toString(16).slice(2, 14) +
              Math.random().toString(16).slice(2, 14)
    });
    totalRequests++;
    totalEarned += 0.001;
  }
  nanoLedger.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({
    simulated: count,
    total_requests: totalRequests,
    total_earned: totalEarned.toFixed(4) + ' USDC',
    message: 'Demo transactions generated for Arc Testnet'
  });
});

app.listen(PORT, () => {
  console.log('StableFX Nano running on port ' + PORT);
  console.log('x402 Nanopayments: $' + (process.env.NANO_PRICE||0.001) + ' USDC per request');
});
