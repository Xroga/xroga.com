import { createContext, useContext } from 'react';
import { createLibrary, defineComponent } from '@openuidev/react-lang';
import { z } from 'zod/v4';
import { Box, Card, Col, Divider, Form, Grid, Row, Spacer } from './upstream/components/layout';
import { Badge, Caption, Label, List, ListItem, Markdown, Text, Title } from './upstream/components/text';
import { Button, Checkbox, DatePicker, IconButton, Input, Pressable, RadioGroup, SegmentedControl, Select, Slider, TextArea } from './upstream/components/controls';
import { Carousel, Code, Flashcard, MathBlock, Popover, Quote } from './upstream/components/extra';
import { Chart } from './upstream/components/chart';
import { Table } from './upstream/components/table';
import { svgComponents } from './upstream/components/svg';
import { Glyph } from './upstream/components/glyph';
import { Clamp, Convert, Lerp, Payment, Percent, Pow, Sqrt } from './upstream/functions/numbers';

import { Format, Plural } from './upstream/functions/text';
import { ChoicePicker } from './ChoicePicker';
import { Between, Change, Cumulative, GroupBy, MovingAvg, Stats, Top } from './upstream/functions/data';
import { Tabs } from './Tabs';
import { Diagram } from './Diagram';
import { EvidenceChip, Resource } from './Resources';
import { Controls, Metric, Section } from './Editorial';

export type AnswerSource = { id: string; title: string; url: string };
export const EvidenceContext = createContext<ReadonlyMap<string, AnswerSource>>(new Map());
export const Source = defineComponent({
  name: 'Source',
  description: 'Link to one source by the exact evidence ID supplied by Xroga. Omit when no IDs were supplied.',
  props: z.object({ id: z.string().max(120) }),
  component: function EvidenceSource({ props }) {
    const source = useContext(EvidenceContext).get(props.id);
    if (!source) return null;
    let url: URL;
    try { url = new URL(source.url); } catch { return null; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return <EvidenceChip url={url} title={source.title} />;
  },
});

const Icon = defineComponent({
  name: 'Icon',
  description: 'A Lucide icon for a label or section. Use only when it aids scanning.',
  props: z.object({ name: z.string().max(50) }),
  component: ({ props }) => <Glyph name={props.name} />,
});

export const library = createLibrary({
  id: 'xroga-native-v1',
  root: 'Col',
  components: [
    Col, Row, Box, Grid, Card, Carousel, Popover, Tabs, Divider, Spacer,
    Title, Text, Caption, Label, Badge, List, ListItem, Markdown, Quote, Code, MathBlock,
    Section, Metric, Controls, Diagram, Form, Input, TextArea, Slider, Select, Checkbox, RadioGroup, SegmentedControl, DatePicker, ChoicePicker,
    Button, IconButton, Pressable, Flashcard, Source, Resource, Icon, Table, Chart, ...svgComponents,
  ],
  functions: [Clamp, Convert, Lerp, Payment, Percent, Pow, Sqrt, Format, Plural, Between, Change, Cumulative, GroupBy, MovingAvg, Stats, Top],
  componentGroups: [
    { name: 'Editorial layout', components: ['Section', 'Metric', 'Col', 'Row', 'Grid', 'Title', 'Text', 'Caption', 'List', 'ListItem', 'Card', 'Quote', 'Badge', 'Source', 'Resource'] },
    { name: 'Data and technical answers', components: ['Table', 'Chart', 'Diagram', 'Math', 'Code', 'Svg', 'G', 'Circle', 'Ellipse', 'Rect', 'Line', 'Path', 'Polyline', 'Polygon', 'SvgText'] },
    { name: 'Local interactions', components: ['Controls', 'Form', 'Slider', 'Input', 'TextArea', 'Select', 'Checkbox', 'RadioGroup', 'SegmentedControl', 'DatePicker', 'ChoicePicker', 'Button', 'IconButton', 'Pressable', 'Popover', 'Carousel', 'Tabs', 'Flashcard'] },
  ],
});
