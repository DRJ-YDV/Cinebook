// This deliberately small adapter models the collection calls used by CineBook.
// It is not MongoDB and cannot prove driver, index, replication or transaction behavior.
const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const { aggregate } = require("./aggregate.cjs");

function valuesAt(document, key) {
  if (!key) return [document];
  const [first, ...rest] = key.split(".");
  if (Array.isArray(document)) return document.flatMap((item) => valuesAt(item, key));
  if (document == null) return [undefined];
  return rest.length ? valuesAt(document[first], rest.join(".")) : [document[first]];
}

function condition(actual, expected) {
  if (expected === null && actual === undefined) return true;
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    return Object.entries(expected).every(([op, value]) => {
      const list = Array.isArray(actual) ? actual : [actual];
      switch (op) {
        case "$in":
          return list.some((item) => value.some((candidate) => equal(item, candidate)));
        case "$nin":
          return !list.some((item) => value.some((candidate) => equal(item, candidate)));
        case "$all":
          return value.every((candidate) => list.some((item) => equal(item, candidate)));
        case "$eq":
          return equal(actual, value);
        case "$ne":
          return !equal(actual, value);
        case "$gt":
          return actual > value;
        case "$gte":
          return actual >= value;
        case "$lt":
          return actual < value;
        case "$lte":
          return actual <= value;
        case "$exists":
          return (actual !== undefined) === value;
        case "$type":
          return typeof actual === value;
        case "$size":
          return Array.isArray(actual) && actual.length === value;
        case "$elemMatch":
          return Array.isArray(actual) && actual.some((item) => matches(item, value));
        case "$not":
          return !condition(actual, value);
        default:
          return matches(actual, expected);
      }
    });
  }
  return Array.isArray(actual)
    ? actual.some((item) => equal(item, expected))
    : equal(actual, expected);
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$and") return expected.every((part) => matches(document, part));
    if (key === "$or") return expected.some((part) => matches(document, part));
    if (key === "$nor") return !expected.some((part) => matches(document, part));
    return valuesAt(document, key).some((actual) => condition(actual, expected));
  });
}

function setAt(document, key, value) {
  const parts = key.split(".");
  const last = parts.pop();
  let current = document;
  for (const part of parts) current = current[part] ??= {};
  current[last] = clone(value);
}

function apply(document, update, inserting = false) {
  for (const [operator, entries] of Object.entries(update)) {
    for (const [key, value] of Object.entries(entries)) {
      const current = valuesAt(document, key)[0];
      if (operator === "$set" || (operator === "$setOnInsert" && inserting))
        setAt(document, key, value);
      else if (operator === "$inc") setAt(document, key, (current ?? 0) + value);
      else if (operator === "$push")
        setAt(document, key, [...(current ?? []), ...(value?.$each ?? [value])]);
      else if (operator === "$addToSet") {
        const items = [...(current ?? [])];
        for (const item of value?.$each ?? [value])
          if (!items.some((other) => equal(item, other))) items.push(item);
        setAt(document, key, items);
      } else if (operator === "$pull") {
        setAt(
          document,
          key,
          (current ?? []).filter((item) => {
            const isOperator =
              value &&
              typeof value === "object" &&
              Object.keys(value).some((part) => part.startsWith("$"));
            return !(isOperator
              ? condition(item, value)
              : typeof value === "object"
                ? matches(item, value)
                : equal(item, value));
          }),
        );
      } else if (operator === "$unset") delete document[key];
    }
  }
}

class DbError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "DbError";
  }
}

function memoryDatabase(initial = {}) {
  const data = clone(initial);
  const operations = [];
  const failures = [];
  let serial = Promise.resolve();
  let counter = 0;

  function collection(name) {
    const rows = () => (data[name] ??= []);
    function record(method, filter, update) {
      operations.push({ name, method, filter: clone(filter), update: clone(update) });
      const failureIndex = failures.findIndex(
        (item) => item.name === name && item.method === method,
      );
      if (failureIndex >= 0) throw failures.splice(failureIndex, 1)[0].error;
    }
    return {
      async countDocuments(filter = {}) {
        record("countDocuments", filter);
        return rows().filter((row) => matches(row, filter)).length;
      },
      async aggregate(pipeline) {
        record("aggregate", pipeline);
        return clone(aggregate(rows(), pipeline, matches));
      },
      async find(filter = {}, options = {}) {
        record("find", filter);
        let result = rows().filter((row) => matches(row, filter));
        if (options.sort)
          result = [...result].sort((a, b) => {
            for (const [key, direction] of Object.entries(options.sort)) {
              const av = valuesAt(a, key)[0],
                bv = valuesAt(b, key)[0];
              if (av !== bv) return (av > bv ? 1 : -1) * direction;
            }
            return 0;
          });
        if (options.skip) result = result.slice(options.skip);
        if (options.limit) result = result.slice(0, options.limit);
        return clone(result);
      },
      async findOne(filter) {
        record("findOne", filter);
        return clone(rows().find((row) => matches(row, filter)) ?? null);
      },
      async insertOne(document) {
        record("insertOne", document);
        rows().push(clone(document));
        return `memory-${++counter}`;
      },
      async insertMany(documents) {
        return Promise.all(documents.map((document) => this.insertOne(document)));
      },
      async updateOne(filter, update, options = {}) {
        record("updateOne", filter, update);
        const row = rows().find((candidate) => matches(candidate, filter));
        if (row) {
          const previous = clone(row);
          apply(row, update);
          return { matchedCount: 1, modifiedCount: equal(previous, row) ? 0 : 1 };
        }
        if (!options.upsert) return { matchedCount: 0, modifiedCount: 0 };
        const inserted = Object.fromEntries(
          Object.entries(filter).filter(
            ([key, value]) => !key.startsWith("$") && (value === null || typeof value !== "object"),
          ),
        );
        apply(inserted, update, true);
        rows().push(inserted);
        return { matchedCount: 0, modifiedCount: 0, upsertedId: `memory-${++counter}` };
      },
      async updateMany(filter, update) {
        record("updateMany", filter, update);
        const found = rows().filter((row) => matches(row, filter));
        found.forEach((row) => apply(row, update));
        return { matchedCount: found.length, modifiedCount: found.length };
      },
      async deleteOne(filter) {
        record("deleteOne", filter);
        const index = rows().findIndex((row) => matches(row, filter));
        if (index < 0) return { deletedCount: 0 };
        rows().splice(index, 1);
        return { deletedCount: 1 };
      },
      async deleteMany(filter) {
        record("deleteMany", filter);
        const previous = rows();
        data[name] = previous.filter((row) => !matches(row, filter));
        return { deletedCount: previous.length - data[name].length };
      },
      async ensureIndex() {},
    };
  }

  async function withTransaction(callback) {
    const run = serial.then(async () => {
      const snapshot = clone(data);
      try {
        return await callback({});
      } catch (error) {
        for (const key of Object.keys(data)) delete data[key];
        Object.assign(data, snapshot);
        throw error;
      }
    });
    serial = run.catch(() => {});
    return run;
  }

  return {
    data,
    operations,
    failNext(
      name,
      method,
      error = new DbError("DB_UNAVAILABLE", "Injected isolated storage failure"),
    ) {
      failures.push({ name, method, error });
    },
    module: {
      collection,
      withTransaction,
      DbError,
      isDbConfigured: () => true,
      toClientError: (error) => ({
        code: error.code ?? "INTERNAL_ERROR",
        message: error.code ? error.message : "Unexpected server error",
      }),
    },
  };
}

module.exports = { memoryDatabase, DbError, matches };
