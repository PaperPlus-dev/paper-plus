require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// IMPORTANT: Stripe webhook needs raw body, so we handle it separately
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;
    
    console.log('Payment successful for user:', userId);
    // Note: We can't directly update Firestore from here since it's a client-side database
    // The client will verify payment status by checking session.payment_status
  }

  res.json({received: true});
});

// For all other routes, use JSON parser
app.use(cors());
app.use(express.json());

app.get('/', function(req, res) {
  res.send('PaperPlus server is running!');
});

// Create Stripe checkout session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { userId, userEmail } = req.body;
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: 'Unlock All Sciences',
            description: 'Full access to Chemistry, Biology, and Physics exam questions',
          },
          unit_amount: 999, // £9.99 in pence
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}?payment=cancelled`,
      customer_email: userEmail,
      metadata: {
        userId: userId,
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.log('Checkout error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Verify payment status
app.post('/verify-payment', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    res.json({ 
      paymentStatus: session.payment_status,
      userId: session.metadata.userId 
    });
  } catch (error) {
    console.log('Verify payment error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Anthropic API proxy
app.post('/api/question', function(req, res) {
  axios.post('https://api.anthropic.com/v1/messages', req.body, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.REACT_APP_ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    }
  })
  .then(function(response) {
    res.json(response.data);
  })
  .catch(function(err) {
    console.log('ERROR:', err.message);
    console.log('DETAILS:', err.response && err.response.data);
    res.status(500).json({ error: err.message });
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, function() {
  console.log(`Server running on port ${PORT}`);
});