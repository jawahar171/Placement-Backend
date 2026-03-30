const Notification = require('../models/Notification');

exports.createNotification = async (io, { recipient, type, title, message, link, metadata }) => {
  try {
    const notification = await Notification.create({
      recipient, type, title, message, link, metadata
    });

    // Emit real-time notification
    if (io) {
      io.to(recipient.toString()).emit('notification', {
        _id: notification._id,
        type, title, message, link,
        createdAt: notification.createdAt
      });
    }

    return notification;
  } catch (err) {
    console.error('Notification creation failed:', err.message);
  }
};
