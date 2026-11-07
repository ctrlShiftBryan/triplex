/**
 * Copyright (c) 2022—present Michael Dougall. All rights reserved.
 *
 * This repository utilizes multiple licenses across different directories. To
 * see this files license find the nearest LICENSE file up the source tree.
 */
export {
  createClassifier,
  type Classification,
  type ComponentRoot,
} from "./classify";
export { collectFiles, main, run, type RunResult } from "./cli";
export {
  addMarker,
  hasIgnoreMarker,
  hasMarker,
  IGNORE_MARKER,
  leadingLineComments,
  MARKER,
} from "./marker";
