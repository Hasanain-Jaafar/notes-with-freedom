// sql.js-fts5 is a community-built drop-in replacement for sql.js compiled with
// -DSQLITE_ENABLE_FTS5 (the official sql.js npm package ships FTS5 disabled).
// Its runtime API is identical to sql.js, so it reuses @types/sql.js as-is.
declare module 'sql.js-fts5' {
  import initSqlJs from 'sql.js'
  export = initSqlJs
}
