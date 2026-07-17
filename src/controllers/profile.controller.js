const User = require('../models/User.model');
const CompanyProfile = require('../models/CompanyProfile.model');

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const companyProfile = await CompanyProfile.findOne({ userId: req.user._id, isDeleted: false });

    res.status(200).json({
      success: true,
      data: {
        user,
        companyProfile
      }
    });
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { username, email, mobileNumber, companyName, openingBalance, openingBalanceDate, openingFine, openingFineDate, openingFine9999, openingFine9999Date } = req.body;

    // Update user fields
    const userUpdateData = { updatedBy: req.user._id };
    if (username) userUpdateData.username = username;
    if (email) userUpdateData.email = email;
    if (mobileNumber) userUpdateData.mobileNumber = mobileNumber;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      userUpdateData,
      { new: true, runValidators: true }
    ).select('-password');

    // Update or create company profile
    const companyUpdateData = { updatedBy: req.user._id };
    if (companyName) companyUpdateData.companyName = companyName;
    if (openingBalance !== undefined) companyUpdateData.openingBalance = openingBalance;
    if (openingBalanceDate !== undefined) companyUpdateData.openingBalanceDate = openingBalanceDate;
    if (openingFine !== undefined) companyUpdateData.openingFine = openingFine;
    if (openingFineDate !== undefined) companyUpdateData.openingFineDate = openingFineDate;
    if (openingFine9999 !== undefined) companyUpdateData.openingFine9999 = openingFine9999;
    if (openingFine9999Date !== undefined) companyUpdateData.openingFine9999Date = openingFine9999Date;

    let companyProfile = await CompanyProfile.findOne({ userId: req.user._id, isDeleted: false });

    if (companyProfile) {
      companyProfile = await CompanyProfile.findOneAndUpdate(
        { userId: req.user._id, isDeleted: false },
        companyUpdateData,
        { new: true, runValidators: true }
      );
    } else {
      companyProfile = await CompanyProfile.create({
        userId: req.user._id,
        companyName: companyName || '',
        openingBalance: openingBalance || 0,
        openingBalanceDate: openingBalanceDate || null,
        openingFine: openingFine || 0,
        openingFineDate: openingFineDate || null,
        openingFine9999: openingFine9999 || 0,
        openingFine9999Date: openingFine9999Date || null,
        createdBy: req.user._id
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser,
        companyProfile
      }
    });
  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
};

module.exports = {
  getProfile,
  updateProfile
};
