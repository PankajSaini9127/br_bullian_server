const Note = require('../models/Note.model');

const generateNoteNo = async (noteType) => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const prefix = noteType === 'credit' ? 'CN' : 'DN';

    const lastNote = await Note.findOne({
      noteNo: new RegExp(`^${prefix}-${year}-${month}-${day}`)
    }).sort({ noteNo: -1 });

    let sequence = 1;
    if (lastNote) {
      const lastSequence = parseInt(lastNote.noteNo.split('-')[4]);
      sequence = lastSequence + 1;
    }

    const noteNo = `${prefix}-${year}-${month}-${day}-${String(sequence).padStart(4, '0')}`;
    return noteNo;
  } catch (error) {
    console.error('Error generating note number:', error);
    return `${noteType === 'credit' ? 'CN' : 'DN'}-${Date.now()}`;
  }
};

module.exports = { generateNoteNo };
