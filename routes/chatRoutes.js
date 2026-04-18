const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ message: 'messages array is required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'Chat service not configured' });
    }

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system:     systemPrompt || 'You are a helpful placement portal assistant.',
        messages,
      },
      {
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 30000,
      }
    );

    const reply = response.data?.content?.[0]?.text
      || "Sorry, I couldn't get a response. Please try again.";

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Chat service error. Please try again.' });
  }
});

module.exports = router;
