let queue = Promise.resolve();

function runMlTask(task) {
  const result = queue.then(task);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

module.exports = runMlTask;
