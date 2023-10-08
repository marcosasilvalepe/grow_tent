const mysql = require('mysql');

//DELETE AFTERWARS -> MULTIPLE STATEMENTS LEADS TO SQL INJECTION!!!!
const conn = mysql.createPool({ connectionLimit: 15, host: "localhost", user: "root", password: "", database: "grow", multipleStatements: true });
module.exports = conn;