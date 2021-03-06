const https = require('https');
const express = require('express');
const router = express.Router();
const [ logEntry, getItemsByDate ] = require('./db');
require('url');

function initRoutes(options) {
  router.use(express.json());

  router.post('/logStudent', async (req, res) => {
    let magStripCode = req.body.magStripCode;
    let netId = req.body.netId;
    let sid = req.body.sid;
    let studentData;

    console.log(req.body);

    try {
      if (req.body.reason === undefined) {
        res.status(400).json({ 'text': 'Please include a reason with the request body'});
        return;
      } else if (magStripCode != undefined) {
        regId = await getStudentRegId(magStripCode);
        studentInfo = await getStudentInfo(regId);
      } else if (netId != undefined) {
        studentInfo = await getStudentInfo(netId, type="net_id");
      } else if (sid != undefined) {
        studentInfo = await getStudentInfo(sid, type="student_number");
      } else {
        res.status(400).json({ 'text': 'Please supply either a magstrip code, net ID, or student ID'});
        return;
      }
    } catch (e) {
      console.log(e);
      res.status(400).json({ 'text': e });
      return;
    }

    studentData = {
      name: studentInfo.StudentName,
      netid: studentInfo.UWNetID,
      sid: studentInfo.StudentNumber,
      reason: req.body.reason,
      timestamp: (new Date()).toISOString()
    }

    let item = await logEntry(studentData);
    if (item.statusCode >= 200 && item.statusCode < 300) {
      studentData.text = `${studentInfo.StudentName} has successfully signed in for: ${req.body.reason}`;
      res.json(studentData);
    } else {
      res.status(500).json({
        "text": "There was an error inserting the data into the database, please check Azure logs"
      });
    }
  });

  router.get('/records', async (req, res) => {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    console.log(startDate, endDate);
    try {
      let data = await getItemsByDate(startDate, endDate);
      data = data.map(record => ({
        name: record.name,
        netId: record.netid,
        studentId: record.sid,
        reason: record.reason,
        timestamp: record.timestamp
      }));

      res.status(200).json(data);
    } catch (e) {
      res.status(500).send(`There was an error getting the information you requested: ${e}`);
    }
  });

  /**
   * Gets the student's RegId for a given a mag strip code
   * @param {string} magStripCode The mag strip code to get information for
   * @returns A Promise with the student's regId or an error
   */
  function getStudentRegId(magStripCode) {
    return new Promise((resolve, reject) => {
      const requestUrl = new URL(`/idcard/v1/card.json`, 'https://wseval.s.uw.edu');
      requestUrl.searchParams.append('mag_strip_code', magStripCode);

      const req = https.get(requestUrl, options, (res) => {
        res.setEncoding('utf-8');
        res.on('data', data => {
          try {
            jsonData = JSON.parse(data);
            if (res.statusCode != 200) {
              reject(jsonData.StatusDescription);
            } else {
              resolve(jsonData.Cards[0].RegID);
            }
          } catch (e) {
            console.log(e);
            console.log(jsonData);
            reject('Unable to pull card info, please try again');
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  /**
   * Gets a students information from their regId
   * @param {string} searchParam Search parameter to find student
   * @param {string} type The type of search parameter, can be: reg_id (Registration ID), net_id (UW Net ID), student_number (Student Number)
   * @returns A Promise with the student's information or an error
   */
  function getStudentInfo(searchParam, type="reg_id") {
    if (type != 'reg_id' && type != 'net_id' && type != 'student_number') {
      throw new Error('Type is not of value reg_id, net_id, or student_number');
    }

    return new Promise((resolve, reject) => {
      const requestUrl = new URL(`/student/v5/person.json`, 'https://wseval.s.uw.edu');
      requestUrl.searchParams.append(type, searchParam);

      const req = https.get(requestUrl, options, res => {
        res.setEncoding('utf-8');

        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });

        res.on('end',  () => {
          jsonData = JSON.parse(rawData);
          if (res.statusCode != 200) {
            reject(jsonData.StatusDescription);
          } else {
            resolve(jsonData.Persons[0]);
          }
        });
      });

      req.on('error', err => {
        reject(err);
      });

      req.end();
    });
  }

  return router;
}

module.exports = initRoutes;