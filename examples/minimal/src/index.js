export function createGreeting(name = "Cortexa") {
  return `Hello, ${name}`;
}

if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  console.log(createGreeting());
}
