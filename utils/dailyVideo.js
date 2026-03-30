const axios = require('axios');

const DAILY_BASE_URL = 'https://api.daily.co/v1';

const dailyApi = axios.create({
  baseURL: DAILY_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.DAILY_API_KEY}`
  }
});

exports.createVideoRoom = async (roomName) => {
  try {
    if (!process.env.DAILY_API_KEY) {
      // Return a mock URL for development/testing
      return {
        url: `https://meet.daily.co/${roomName}`,
        name: roomName
      };
    }

    const exp = Math.floor(Date.now() / 1000) + 7200; // 2 hour expiry
    const response = await dailyApi.post('/rooms', {
      name: roomName,
      privacy: 'public',
      properties: {
        exp,
        enable_recording: 'cloud',
        enable_chat: true,
        enable_screenshare: true,
        start_video_off: false,
        start_audio_off: false
      }
    });
    return response.data;
  } catch (err) {
    console.error('Daily.co room creation failed:', err.message);
    return {
      url: `https://meet.daily.co/${roomName}`,
      name: roomName
    };
  }
};

exports.deleteVideoRoom = async (roomName) => {
  try {
    await dailyApi.delete(`/rooms/${roomName}`);
  } catch (err) {
    console.error('Daily.co room deletion failed:', err.message);
  }
};
