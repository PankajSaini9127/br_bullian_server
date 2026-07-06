const Note = require('../models/Note.model');
const { generateNoteNo } = require('../utils/noteGenerator');

const createNote = async (req, res) => {
  try {
    const { noteType, date, partyId, reason, amount, fine } = req.body;

    if (!noteType || !date || !partyId) {
      return res.status(400).json({
        success: false,
        message: 'Note type, date, and party id are required'
      });
    }

    if (!['credit', 'debit'].includes(noteType)) {
      return res.status(400).json({
        success: false,
        message: 'Note type must be either credit or debit'
      });
    }

    const noteNo = await generateNoteNo(noteType);

    const note = await Note.create({
      noteNo,
      noteType,
      date,
      partyId,
      reason: reason || '',
      amount: amount || 0,
      fine: fine || 0,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: `${noteType === 'credit' ? 'Credit' : 'Debit'} note created successfully`,
      data: { note }
    });
  } catch (error) {
    console.error('Create Note Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating note',
      error: error.message
    });
  }
};

const getAllNotes = async (req, res) => {
  try {
    const { noteType, partyId, startDate, endDate, page = 1, limit = 10 } = req.query;

    const filter = { isDeleted: false };
    if (noteType) filter.noteType = noteType;
    if (partyId) filter.partyId = partyId;
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const notes = await Note.find(filter)
      .populate('partyId', 'partyName contactNo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Note.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        notes,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum
        }
      }
    });
  } catch (error) {
    console.error('Get All Notes Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notes',
      error: error.message
    });
  }
};

const getNoteById = async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, isDeleted: false })
      .populate('partyId', 'partyName contactNo address email gstin');

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { note }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching note',
      error: error.message
    });
  }
};

const updateNote = async (req, res) => {
  try {
    const { date, partyId, reason, amount, fine, isActive } = req.body;

    const updateData = { date, partyId, reason, amount, fine, isActive, updatedBy: req.user._id };

    const note = await Note.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Note updated successfully',
      data: { note }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating note',
      error: error.message
    });
  }
};

const deleteNote = async (req, res) => {
  try {
    const note = await Note.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedBy: req.user._id },
      { new: true }
    );

    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Note deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting note',
      error: error.message
    });
  }
};

module.exports = {
  createNote,
  getAllNotes,
  getNoteById,
  updateNote,
  deleteNote
};
