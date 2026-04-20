const Query = require('../models/Query');
const { createNotification } = require('../utils/notifications');

// ── POST /api/queries  — raise a new query ────────────────────────────────────
exports.createQuery = async (req, res) => {
  try {
    const { category, priority, subject, message } = req.body;
    if (!category || !subject || !message)
      return res.status(400).json({ message: 'category, subject and message are required' });

    const query = await Query.create({
      raisedBy: req.user._id,
      role:     req.user.role,
      category, priority, subject, message,
    });

    const populated = await Query.findById(query._id).populate('raisedBy', 'name email role companyName');
    return res.status(201).json(populated);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/queries  — list queries (admin sees all, others see own) ─────────
exports.getQueries = async (req, res) => {
  try {
    const { status, category, priority, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (req.user.role !== 'admin') filter.raisedBy = req.user._id;
    if (status)   filter.status   = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;

    const total   = await Query.countDocuments(filter);
    const queries = await Query.find(filter)
      .populate('raisedBy',  'name email role companyName department rollNumber')
      .populate('resolvedBy','name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return res.json({ queries, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/queries/:id  — single query ──────────────────────────────────────
exports.getQueryById = async (req, res) => {
  try {
    const query = await Query.findById(req.params.id)
      .populate('raisedBy',   'name email role companyName department rollNumber avatar')
      .populate('resolvedBy', 'name')
      .populate('replies.author', 'name role companyName');

    if (!query) return res.status(404).json({ message: 'Query not found' });

    // Non-admins can only see their own queries
    if (req.user.role !== 'admin' && query.raisedBy._id.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Forbidden' });

    return res.json(query);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── POST /api/queries/:id/reply  — add a reply ────────────────────────────────
exports.addReply = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: 'Reply message required' });

    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ message: 'Query not found' });

    // Non-admins can only reply to their own queries
    if (req.user.role !== 'admin' && query.raisedBy.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Forbidden' });

    query.replies.push({ author: req.user._id, role: req.user.role, message: message.trim() });

    // Auto-move to in_progress when admin replies
    if (req.user.role === 'admin' && query.status === 'open')
      query.status = 'in_progress';

    await query.save();

    // Notify the ticket owner if admin replied, or notify admin if user replied
    const io = req.app.get('io');
    if (req.user.role === 'admin') {
      await createNotification(io, {
        recipient: query.raisedBy,
        type:      'query_reply',
        title:     'Query Updated',
        message:   `Admin replied to your query: ${query.subject}`,
        link:      `/${query.role}/queries/${query._id}`
      });
    }

    const populated = await Query.findById(query._id)
      .populate('raisedBy', 'name email role companyName')
      .populate('replies.author', 'name role companyName');

    return res.json(populated);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/queries/:id/status  — update status (admin only) ───────────────
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['open', 'in_progress', 'resolved', 'closed'];
    if (!valid.includes(status))
      return res.status(400).json({ message: 'Invalid status' });

    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ message: 'Query not found' });

    query.status = status;
    if (status === 'resolved') {
      query.resolvedAt = new Date();
      query.resolvedBy = req.user._id;
    }
    await query.save();

    // Notify the ticket owner
    const io = req.app.get('io');
    await createNotification(io, {
      recipient: query.raisedBy,
      type:      'query_status',
      title:     'Query Status Updated',
      message:   `Your query "${query.subject}" is now ${status.replace('_', ' ')}`,
      link:      `/${query.role}/queries/${query._id}`
    });

    const populated = await Query.findById(query._id)
      .populate('raisedBy', 'name email role companyName')
      .populate('resolvedBy', 'name');

    return res.json(populated);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/queries/:id  — delete own open query ─────────────────────────
exports.deleteQuery = async (req, res) => {
  try {
    const query = await Query.findById(req.params.id);
    if (!query) return res.status(404).json({ message: 'Query not found' });
    if (query.raisedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    await query.deleteOne();
    return res.json({ message: 'Query deleted' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── GET /api/queries/stats  — admin dashboard stats ──────────────────────────
exports.getStats = async (req, res) => {
  try {
    const [total, open, inProgress, resolved, closed] = await Promise.all([
      Query.countDocuments(),
      Query.countDocuments({ status: 'open' }),
      Query.countDocuments({ status: 'in_progress' }),
      Query.countDocuments({ status: 'resolved' }),
      Query.countDocuments({ status: 'closed' }),
    ]);
    return res.json({ total, open, inProgress, resolved, closed });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
