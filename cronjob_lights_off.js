"use strict";

const mysql = require('mysql');

//DELETE AFTERWARS -> MULTIPLE STATEMENTS LEADS TO SQL INJECTION!!!!
const conn = mysql.createPool({ connectionLimit: 15, host: "localhost", user: "root", password: "", database: "grow" });

const format_date = date => {
    let
    current_date = date.getDate(),
    current_month = date.getMonth() + 1,
    current_year = date.getFullYear(),
    current_hrs = date.getHours(),
    current_mins = date.getMinutes(),
    current_secs = date.getSeconds();

    // Add 0 before date, month, hrs, mins or secs if they are less than 0
    current_date = current_date < 10 ? '0' + current_date : current_date;
    current_month = current_month < 10 ? '0' + current_month : current_month;
    current_hrs = current_hrs < 10 ? '0' + current_hrs : current_hrs;
    current_mins = current_mins < 10 ? '0' + current_mins : current_mins;
    current_secs = current_secs < 10 ? '0' + current_secs : current_secs;

    return current_year + '-' + current_month + '-' + current_date + ' ' + current_hrs + ':' + current_mins + ':' + current_secs;
}

const save_date = date => {
    return new Promise((resolve, reject) => {
        conn.query(`
            UPDATE test SET date='${date}';
        `, (error, results, fields) => {
            if (error) return reject(error);
            return resolve();
        })
    })
}

(async () => {
    try {

        const now = format_date(new Date());

        await save_date(now);

    }
    catch(e) { console.log(e) }
    finally { process.exit() }
})();