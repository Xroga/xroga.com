import { AlertTriangle, Apple, Award, BarChart3, BedDouble, BookOpen, Briefcase, Building, Building2, Calendar, Camera, Car, CheckCircle2, Clipboard, Clock, Cloud, Code, Cpu, CreditCard, Database, DollarSign, Dumbbell, FileText, Flag, GitBranch, Gavel, Globe, GraduationCap, Handshake, HeartPulse, Home, Hotel, Image as ImageIcon, Info, Key, Layers, Leaf, Lightbulb, LineChart, Link as LinkIcon, Lock, Mail, MapPin, Megaphone, MessageSquare, Moon, Music, Package, Palette, Percent, Phone, PieChart, Pill, Plane, Puzzle, Receipt, Rocket, Scale, Search, Server, Settings, Shield, ShoppingCart, Stethoscope, Star, Store, Sun, Target, Terminal, Train, TrendingDown, TrendingUp, Truck, User, Users, Utensils, Wallet, Wifi, Workflow, Wrench, Zap, type LucideIcon } from 'lucide-react';

/** Allow-list mirrored from backend/src/ai/responseIcons.ts. A name outside the list renders nothing, so a model cannot
 * make the page load anything and an icon is only ever decoration beside text. */
export const RESPONSE_ICON_MAP: Record<string, LucideIcon> = {
  home: Home, building: Building, bed: BedDouble, 'map-pin': MapPin, plane: Plane, car: Car, train: Train, hotel: Hotel, utensils: Utensils, camera: Camera,
  'dollar-sign': DollarSign, 'credit-card': CreditCard, percent: Percent, 'trending-up': TrendingUp, 'trending-down': TrendingDown, 'bar-chart': BarChart3, 'pie-chart': PieChart, 'line-chart': LineChart, wallet: Wallet, receipt: Receipt,
  shield: Shield, lock: Lock, key: Key, scale: Scale, gavel: Gavel, 'file-text': FileText, clipboard: Clipboard, 'check-circle': CheckCircle2, 'alert-triangle': AlertTriangle, info: Info,
  'heart-pulse': HeartPulse, stethoscope: Stethoscope, pill: Pill, dumbbell: Dumbbell, apple: Apple, leaf: Leaf, sun: Sun, moon: Moon, cloud: Cloud,
  database: Database, server: Server, cpu: Cpu, code: Code, terminal: Terminal, 'git-branch': GitBranch, workflow: Workflow, layers: Layers, globe: Globe, wifi: Wifi,
  users: Users, user: User, briefcase: Briefcase, 'building-2': Building2, store: Store, 'shopping-cart': ShoppingCart, package: Package, truck: Truck, mail: Mail, phone: Phone, 'message-square': MessageSquare,
  'book-open': BookOpen, 'graduation-cap': GraduationCap, lightbulb: Lightbulb, target: Target, rocket: Rocket, zap: Zap, star: Star, flag: Flag, award: Award, wrench: Wrench, settings: Settings,
  calendar: Calendar, clock: Clock, search: Search, link: LinkIcon, image: ImageIcon, music: Music, palette: Palette, megaphone: Megaphone, handshake: Handshake, puzzle: Puzzle,
};
export function responseIcon(name: unknown): LucideIcon | undefined {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(RESPONSE_ICON_MAP, name) ? RESPONSE_ICON_MAP[name] : undefined;
}
