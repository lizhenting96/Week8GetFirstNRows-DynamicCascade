const express = require("express");
const app = express();
const PORT = process.env.PORT || 4000;
const { pool } = require("./dbConfig");

app.use(express.static(__dirname + '/public'));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));


app.get("/select", (req, res) => {
   // get table name dynamically
   var tableNames = []
   var tableColList = []
   ; (async () => {
      // note: we don't try/catch this because if connecting throws an exception
      // we don't need to dispose of the client (it will be undefined)
      const client = await pool.connect()
      try {
         
         await client.query('BEGIN')
         tableNames = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).rows.map(tableName => tableName.tablename)
         // console.log(tableNames)

         await asyncForEach(tableNames, async (tableName) => {
            // returnedCols is a list of objects, each list corresponds to a table and each object corresponds to a colname in a table
            let returnedCols = (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' and table_name='${tableName}';`)).rows
            let curTableCols = returnedCols.map(colname => colname.column_name)
            tableColList.push(curTableCols)
         })
         // console.log(tableColList);
         const { tableName } = req.query;
         const { firstNRows } = req.query;
         const { col1 } = req.query;
         const { order } = req.query;
         const { col2 } = req.query;
         const { searchInput } = req.query;
         if (tableName == undefined || tableName == "") {
            // tablename is empty, return no rows
            // console.log(tableColList);
            res.render("select", {tableNames, tableColList});
         }
         else {
            // tablename is filled, some rows are returned
            var queryStr = `SELECT * FROM ${tableName} `;
            // search for specific column content
            if (col2 != undefined && col2 != "") queryStr += `WHERE (UPPER(${col2}) LIKE UPPER('%${searchInput}%')) `;
            // a column is chosen for ordering
            if (col1 != undefined && col1 != "") queryStr += `ORDER BY ${col1} `;
            // whether it is descending or ascending
            if (order != undefined && order != "") queryStr += `${order} `;
            // limit the number of rows
            queryStr += `LIMIT $1`

            pool.query(queryStr,
               [firstNRows],
               (err, results) => {
                  if (err) {
                     throw err;
                  }
                  const returnedRows = results.rows;
                  // console.log(tableColList)
                  res.render("select", { returnedRows, tableNames, tableColList, tableName, firstNRows, col1, col2, order, searchInput });
                  // console.log(returnedRows)
               })
         }
         await client.query('COMMIT')
      } catch (e) {
         await client.query('ROLLBACK')
         throw e
      } finally {
         client.release()
      }
   })().catch(e => console.error(e.stack))
});

app.get("/script", (req, res) => {
   res.render("script");
})

// code from node-postgres documentation
// https://node-postgres.com/features/transactions
app.post("/script", async (req, response) => {
   let message;
   let { inputScript } = req.body;
   pool.connect((err, client, done) => {
      const shouldAbort = err => {
         if (err) {
            message = "Error in transaction\n" + err.message;
            response.render("script", { message });
            console.error('Error in transaction', err.stack)
            client.query('ROLLBACK', err => {
               if (err) {
                  console.error('Error rolling back client', err.stack)
               }
               // release the client back to the pool
               done()
            })
         }
         return !!err
      }
      client.query('BEGIN', err => {
         if (shouldAbort(err)) return
         client.query(inputScript, (err, res) => {
            // "res" is the returned results from database
            // "response" is used to render the webpage
            if (shouldAbort(err)) return
            message = `Operation ${res.command} is successful!`
            const returnedRows = res.rows;
            response.render("script", { message, returnedRows }); // change this
            client.query('COMMIT', err => {
               if (err) {
                  console.error('Error committing transaction', err.stack)
               }
               done()
            })
         })
      })
   })
})

app.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));

async function asyncForEach(array, callback) {
   for (let index = 0; index < array.length; index++) {
     await callback(array[index], index, array);
   }
 }