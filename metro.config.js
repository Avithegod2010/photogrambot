const { getDefaultConfig } = require("expo/metro-config");
const exclusionListModule = require("metro-config/private/defaults/exclusionList");
const exclusionList = exclusionListModule.default ?? exclusionListModule;

const config = getDefaultConfig(__dirname);

const androidBuildDirs = exclusionList([
  /android\/app\/build\/.*/,
  /android\/app\/\.cxx\/.*/,
  /android\/build\/.*/,
  /android\/\.gradle\/.*/,
]);

config.resolver.blockList = Array.isArray(config.resolver.blockList)
  ? [...config.resolver.blockList, androidBuildDirs]
  : config.resolver.blockList
    ? [config.resolver.blockList, androidBuildDirs]
    : [androidBuildDirs];

module.exports = config;
