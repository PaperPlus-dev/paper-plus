require('dotenv').config();
console.log('API KEY:', process.env.REACT_APP_ANTHROPIC_KEY);
var express = require('express');
var cors = require('cors');
var axios = require('axios');

var app = express();
app.use(cors());
app.use(express.json());
app.get('/', function(req, res) {
  res.send('PaperPlus server is running!');
});

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

app.listen(3001, function() {
  console.log('Server running on port 3001');
});





