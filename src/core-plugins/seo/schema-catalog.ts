/**
 * Curated catalog of schema.org types users can install.
 *
 * Renders the cards on /admin/seo → Install schemas, and (when Posts/Pages
 * ship) gates which @types appear in the per-post Schema selector. The
 * `seo.enabled_schemas` setting holds the user's chosen subset as an array
 * of `type` strings — anything not in this list is hidden from authors.
 *
 * Auto-emitted derived schemas (WebSite, BreadcrumbList, Organization,
 * Article-from-post-fields) are NOT in this list — they live on the
 * Identity tab and stay automatic.
 */
import {
  Newspaper,
  BookOpen,
  Package,
  Star,
  Stars,
  Utensils,
  ListChecks,
  HelpCircle,
  Calendar,
  GraduationCap,
  Briefcase,
  Video,
  Image as ImageIcon,
  Book,
  Film,
  Store,
  Wrench,
  Code,
  User,
  type LucideIcon,
} from "lucide-react";

export interface SchemaCatalogEntry {
  /** schema.org `@type` — also the persisted identifier. */
  type: string;
  name: string;
  description: string;
  docsUrl: string;
  icon: LucideIcon;
}

const docsUrl = (type: string) => `https://schema.org/${type}`;

export const SCHEMA_CATALOG: readonly SchemaCatalogEntry[] = [
  {
    type: "Article",
    name: "Article",
    description: "Generic news, magazine, or scholarly article.",
    docsUrl: docsUrl("Article"),
    icon: Newspaper,
  },
  {
    type: "BlogPosting",
    name: "Blog Posting",
    description: "An entry in a personal or company blog.",
    docsUrl: docsUrl("BlogPosting"),
    icon: BookOpen,
  },
  {
    type: "NewsArticle",
    name: "News Article",
    description: "A news report. Required for Google Top Stories.",
    docsUrl: docsUrl("NewsArticle"),
    icon: Newspaper,
  },
  {
    type: "Product",
    name: "Product",
    description: "An item for sale or display, with price and availability.",
    docsUrl: docsUrl("Product"),
    icon: Package,
  },
  {
    type: "Review",
    name: "Review",
    description: "A critical evaluation with a rating value.",
    docsUrl: docsUrl("Review"),
    icon: Star,
  },
  {
    type: "AggregateRating",
    name: "Aggregate Rating",
    description: "Average rating computed from multiple reviews.",
    docsUrl: docsUrl("AggregateRating"),
    icon: Stars,
  },
  {
    type: "Recipe",
    name: "Recipe",
    description: "Cooking instructions with ingredients and timing.",
    docsUrl: docsUrl("Recipe"),
    icon: Utensils,
  },
  {
    type: "HowTo",
    name: "How-To",
    description: "Step-by-step instructions for completing a task.",
    docsUrl: docsUrl("HowTo"),
    icon: ListChecks,
  },
  {
    type: "FAQPage",
    name: "FAQ Page",
    description: "Page with a list of frequently asked questions and answers.",
    docsUrl: docsUrl("FAQPage"),
    icon: HelpCircle,
  },
  {
    type: "Event",
    name: "Event",
    description: "Something happening at a place and time — concert, meetup, conference.",
    docsUrl: docsUrl("Event"),
    icon: Calendar,
  },
  {
    type: "Course",
    name: "Course",
    description: "An educational course or class.",
    docsUrl: docsUrl("Course"),
    icon: GraduationCap,
  },
  {
    type: "JobPosting",
    name: "Job Posting",
    description: "An open employment position.",
    docsUrl: docsUrl("JobPosting"),
    icon: Briefcase,
  },
  {
    type: "VideoObject",
    name: "Video Object",
    description: "A single video file with metadata for video search.",
    docsUrl: docsUrl("VideoObject"),
    icon: Video,
  },
  {
    type: "ImageObject",
    name: "Image Object",
    description: "An image with full metadata (license, author, caption).",
    docsUrl: docsUrl("ImageObject"),
    icon: ImageIcon,
  },
  {
    type: "Book",
    name: "Book",
    description: "A book or e-book, with ISBN and author.",
    docsUrl: docsUrl("Book"),
    icon: Book,
  },
  {
    type: "Movie",
    name: "Movie",
    description: "A motion picture, with cast, director, and rating.",
    docsUrl: docsUrl("Movie"),
    icon: Film,
  },
  {
    type: "LocalBusiness",
    name: "Local Business",
    description: "A physical business location, with address and hours.",
    docsUrl: docsUrl("LocalBusiness"),
    icon: Store,
  },
  {
    type: "Service",
    name: "Service",
    description: "A service provided by a person or organization.",
    docsUrl: docsUrl("Service"),
    icon: Wrench,
  },
  {
    type: "SoftwareApplication",
    name: "Software Application",
    description: "A piece of software — web app, mobile app, or desktop program.",
    docsUrl: docsUrl("SoftwareApplication"),
    icon: Code,
  },
  {
    type: "Person",
    name: "Person",
    description: "An individual — for author bios, profiles, and team pages.",
    docsUrl: docsUrl("Person"),
    icon: User,
  },
];

/** Set of all valid `@type` strings from the catalog — used by the setting validator. */
export const SCHEMA_CATALOG_TYPES: ReadonlySet<string> = new Set(
  SCHEMA_CATALOG.map((s) => s.type),
);
