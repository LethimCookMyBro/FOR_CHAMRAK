function methodsFromPrototype(prototype) {
  return Object.fromEntries(
    Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== "constructor")
      .map((name) => [name, prototype[name]])
  );
}

export { methodsFromPrototype };
