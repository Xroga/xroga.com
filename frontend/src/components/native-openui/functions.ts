// The renderer and generated server snapshot runtime use this exact upstream registry.
import { Clamp, Convert, Lerp, Payment, Percent, Pow, Sqrt } from './upstream/functions/numbers';
import { Default, Duration, Format, Plural } from './upstream/functions/text';
import { AddDays, AddMonths, DaysBetween, StartOf } from './upstream/functions/calendar';
import { Between, Change, Cumulative, GroupBy, Histogram, MovingAvg, Stats, Top } from './upstream/functions/data';
import { Chunk, Find, Includes, MixColor, Reverse, Slice, Take } from './upstream/functions/collections';

export const nativeFunctions = [Clamp, Convert, Lerp, Payment, Percent, Pow, Sqrt, Format, Plural, Default, Duration,
  Between, Change, Cumulative, GroupBy, Histogram, MovingAvg, Stats, Top, AddDays, AddMonths, DaysBetween, StartOf,
  Chunk, Find, Includes, MixColor, Reverse, Slice, Take];
