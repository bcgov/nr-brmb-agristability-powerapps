import type { ColumnIcon } from '../types/enrollment';
import {
  CalendarDays,
  CheckSquare,
  Hash,
  Link,
  List,
  Type,
  User,
  type LucideIcon,
} from 'lucide-react';

export const COLUMN_ICON_COMPONENTS: Record<ColumnIcon, LucideIcon> = {
  text: Type,
  number: Hash,
  list: List,
  link: Link,
  user: User,
  check: CheckSquare,
  date: CalendarDays,
};
