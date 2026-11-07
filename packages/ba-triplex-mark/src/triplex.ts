/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */

// Triplex internals the classifier runs on. Neither is exported by its
// package, so upstream merges may move them: this is the only file to update.
export { default as triplexBabelPlugin } from "@triplex/client/src/plugins/babel-plugin";
export { inferExports } from "@triplex/server/src/util/module";
