// Small isolated aggregation interpreter. This tests application pipeline intent;
// it is not evidence of real MongoDB execution or production-scale performance.
const at = (row, field) => field.split(".").reduce((value, key) => value?.[key], row);

function expression(value, row) {
  if (typeof value === "string" && value.startsWith("$")) return at(row, value.slice(1));
  if (value == null || typeof value !== "object" || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => expression(item, row));
  const [operator, argument] = Object.entries(value)[0];
  switch (operator) {
    case "$eq": {
      const [a, b] = expression(argument, row);
      return a === b;
    }
    case "$and":
      return expression(argument, row).every(Boolean);
    case "$ifNull": {
      const input = expression(argument[0], row);
      return input == null ? expression(argument[1], row) : input;
    }
    case "$cond":
      return expression(argument[0], row)
        ? expression(argument[1], row)
        : expression(argument[2], row);
    case "$convert": {
      const input = expression(argument.input, row);
      if (input == null) return argument.onNull;
      if (argument.to !== "date") throw new Error("Unsupported isolated conversion");
      const date = new Date(input);
      return Number.isNaN(date.getTime()) ? argument.onError : date;
    }
    case "$dateToString":
      return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: argument.timezone,
      }).format(expression(argument.date, row));
    default:
      throw new Error(`Unsupported isolated expression ${operator}`);
  }
}

function aggregate(rows, pipeline, matches) {
  let result = [...rows];
  for (const stage of pipeline) {
    const [operator, spec] = Object.entries(stage)[0];
    switch (operator) {
      case "$match":
        result = result.filter((row) => matches(row, spec));
        break;
      case "$facet":
        result = [
          Object.fromEntries(
            Object.entries(spec).map(([name, branch]) => [
              name,
              aggregate(result, branch, matches),
            ]),
          ),
        ];
        break;
      case "$addFields":
        result = result.map((row) => ({
          ...row,
          ...Object.fromEntries(
            Object.entries(spec).map(([key, value]) => [key, expression(value, row)]),
          ),
        }));
        break;
      case "$sort":
        result.sort((a, b) => {
          for (const [key, direction] of Object.entries(spec)) {
            const av = at(a, key),
              bv = at(b, key);
            if (av !== bv) return (av > bv ? 1 : -1) * direction;
          }
          return 0;
        });
        break;
      case "$limit":
        result = result.slice(0, spec);
        break;
      case "$count":
        result = result.length ? [{ [spec]: result.length }] : [];
        break;
      case "$project":
        result = result.map((row) =>
          Object.fromEntries(
            Object.entries(spec)
              .filter(([, value]) => value !== 0)
              .map(([key, value]) => [key, value === 1 ? at(row, key) : expression(value, row)]),
          ),
        );
        break;
      case "$group": {
        const groups = new Map();
        for (const row of result) {
          const id = expression(spec._id, row) ?? null;
          const key = JSON.stringify(id);
          const isFirst = !groups.has(key);
          const group = groups.get(key) ?? { _id: id };
          for (const [field, accumulator] of Object.entries(spec)) {
            if (field === "_id") continue;
            const [operation, input] = Object.entries(accumulator)[0];
            const value = expression(input, row);
            if (operation === "$sum")
              group[field] = (group[field] ?? 0) + (typeof value === "number" ? value : 0);
            else if (operation === "$first") {
              if (isFirst) group[field] = value;
            } else throw new Error(`Unsupported isolated accumulator ${operation}`);
          }
          groups.set(key, group);
        }
        result = [...groups.values()];
        break;
      }
      default:
        throw new Error(`Unsupported isolated pipeline stage ${operator}`);
    }
  }
  return result;
}

module.exports = { aggregate };
