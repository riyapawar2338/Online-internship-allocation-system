// routes/studentRoutes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/studentController');
const { protect }                        = require('../middleware/auth');
const { studentRules, mongoIdParam, validate } = require('../middleware/validate');
const upload  = require('../middleware/upload');

// Public: browse students (admin also uses this)
router.get ('/'                    , ctrl.getAllStudents);
router.get ('/:id'                 , mongoIdParam(), validate, ctrl.getStudentById);
router.get ('/:id/recommendations' , mongoIdParam(), validate, ctrl.getRecommendationsForStudent);
router.get ('/:id/applications'    , mongoIdParam(), validate, ctrl.getStudentApplications);
router.get ('/:id/resume'          , mongoIdParam(), validate, ctrl.downloadResume);

// Mutations — protected (admin)
router.post ('/'    , protect, upload.single('resume'), studentRules, validate, ctrl.createStudent);
router.put  ('/:id' , protect, mongoIdParam(), validate, upload.single('resume'), ctrl.updateStudent);
router.delete('/:id', protect, mongoIdParam(), validate, ctrl.deleteStudent);

module.exports = router;