/** The test runner compiles JSX to the classic React.createElement; this makes React visible to the component under test. Import it first. */
import * as React from 'react';

(globalThis as unknown as { React: typeof React }).React = React;
