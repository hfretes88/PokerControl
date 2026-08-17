module.exports = {
  pick: jest.fn(() => Promise.resolve([])),
  types: { json: 'application/json', allFiles: '*/*' },
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
  isErrorWithCode: err => typeof err === 'object' && err !== null && 'code' in err,
};
