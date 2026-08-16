module.exports = {
  DocumentDirectoryPath: '/mock/documents',
  writeFile: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve('')),
  scanFile: jest.fn(() => Promise.resolve()),
};
