import { createContext, useContext } from 'react';
import { createLibrary, defineComponent } from '@openuidev/react-lang';
import { z } from 'zod/v4';
import { Box, Card, Col, Divider, Form, Grid, Row, Spacer } from './upstream/components/layout';
import { Badge, Caption, Label, List, ListItem, Markdown, Text, Title } from './upstream/components/text';
import { Button, Checkbox, DatePicker, IconButton, Input, Pressable, RadioGroup, SegmentedControl, Select, Slider, TextArea, Timer } from './upstream/components/controls';
import { Carousel, Code, Flashcard, MathBlock, Popover, Quote } from './upstream/components/extra';
import { Chart } from './upstream/components/chart';
import { Table } from './upstream/components/table';
import { svgComponents } from './upstream/components/svg';
import { Glyph } from './upstream/components/glyph';
import { color, fg } from './upstream/components/style';
import { Clamp, Convert, Lerp, Payment, Percent, Pow, Sqrt } from './upstream/functions/numbers';

import { Default, Duration, Format, Plural } from './upstream/functions/text';
import { AddDays, AddMonths, DaysBetween, StartOf } from './upstream/functions/calendar';
import { ChoicePicker } from './ChoicePicker';
import { Between, Change, Cumulative, GroupBy, Histogram, MovingAvg, Stats, Top } from './upstream/functions/data';
import { Chunk, Find, Includes, MixColor, Reverse, Slice, Take } from './upstream/functions/collections';
import { Tabs } from './Tabs';
import { Diagram } from './Diagram';
import { EvidenceChip, Resource } from './Resources';
import { Controls, Metric, Section } from './Editorial';

export type AnswerSource = { id: string; title: string; url: string; siteName?: string };
export const EvidenceContext = createContext<ReadonlyMap<string, AnswerSource>>(new Map());
export const Source = defineComponent({
  name: 'Source',
  description: 'Link to one source by the exact evidence ID supplied by Xroga. Omit when no IDs were supplied.',
  props: z.object({ id: z.string().max(120) }),
  component: function EvidenceSource({ props }) {
    const source = useContext(EvidenceContext).get(props.id);
    return source ? <EvidenceChip href={source.url} title={source.title} siteName={source.siteName} /> : null;
  },
});

const Icon = defineComponent({
  name: 'Icon',
  description: 'An installed Lucide icon by kebab-case name, e.g. plane, wallet, microscope or calendar-days. Optional semantic color and size.',
  props: z.object({ name: z.string().max(64), size: z.enum(['sm', 'md', 'lg', 'xl']).optional(), color: color.optional() }),
  component: ({ props }) => <span className="iui-icon" style={{ color: fg(props.color) }}>
    <Glyph name={props.name} size={{ sm: 14, md: 18, lg: 24, xl: 32 }[props.size ?? 'md']} />
  </span>,
});

export const library = createLibrary({
  id: 'xroga-native-v1',
  root: 'Col',
  components: [
    Col, Row, Box, Grid, Card, Carousel, Popover, Tabs, Divider, Spacer,
    Title, Text, Caption, Label, Badge, List, ListItem, Markdown, Quote, Code, MathBlock,
    Section, Metric, Controls, Diagram, Form, Input, TextArea, Slider, Select, Checkbox, RadioGroup, SegmentedControl, DatePicker, ChoicePicker, Timer,
    Button, IconButton, Pressable, Flashcard, Source, Resource, Icon, Table, Chart, ...svgComponents,
  ],
  functions: [Clamp, Convert, Lerp, Payment, Percent, Pow, Sqrt, Format, Plural, Default, Duration,
    Between, Change, Cumulative, GroupBy, Histogram, MovingAvg, Stats, Top, AddDays, AddMonths, DaysBetween, StartOf,
    Chunk, Find, Includes, MixColor, Reverse, Slice, Take],
  componentGroups: [
    { name: 'Editorial layout', components: ['Section', 'Metric', 'Col', 'Row', 'Grid', 'Title', 'Text', 'Caption', 'List', 'ListItem', 'Card', 'Quote', 'Badge', 'Source', 'Resource'] },
    { name: 'Data and technical answers', components: ['Table', 'Chart', 'Diagram', 'Math', 'Code', 'Svg', 'G', 'Circle', 'Ellipse', 'Rect', 'Line', 'Path', 'Polyline', 'Polygon', 'SvgText'] },
    { name: 'Local interactions', components: ['Controls', 'Form', 'Slider', 'Input', 'TextArea', 'Select', 'Checkbox', 'RadioGroup', 'SegmentedControl', 'DatePicker', 'ChoicePicker', 'Timer', 'Button', 'IconButton', 'Pressable', 'Popover', 'Carousel', 'Tabs', 'Flashcard'] },
  ],
});
