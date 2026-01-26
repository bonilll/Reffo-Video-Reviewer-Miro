import { Reference } from "@/components/library/LibraryItem";
import { Id } from "@/convex/_generated/dataModel";

export const mockReferences: Reference[] = [
  {
    _id: "ref1" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Mountains at dusk",
    type: "image",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "John Doe",
    tokens: ["landscape", "moody", "nature"],
    fileUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba",
    fileName: "mountains-at-dusk.jpg"
  },
  {
    _id: "ref2" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Urban cityscape",
    type: "image",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "Jane Smith",
    tokens: ["urban", "architecture", "modern"],
    fileUrl: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df",
    fileName: "urban-cityscape.jpg"
  },
  {
    _id: "ref3" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Abstract painting",
    type: "image",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "Alice Johnson",
    tokens: ["abstract", "colorful", "artistic"],
    fileUrl: "https://images.unsplash.com/photo-1573521193826-58c7dc2e13e3",
    fileName: "abstract-painting.jpg"
  },
  {
    _id: "ref4" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Minimalist interior",
    type: "image",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "Bob Wilson",
    tokens: ["minimal", "architecture", "modern"],
    fileUrl: "https://images.unsplash.com/photo-1449247709967-d4461a6a6103",
    fileName: "minimalist-interior.jpg"
  },
  {
    _id: "ref5" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Ocean waves",
    type: "image",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "Carol Brown",
    tokens: ["nature", "moody", "landscape"],
    fileUrl: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0",
    fileName: "ocean-waves.jpg"
  },
  {
    _id: "ref6" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Forest path",
    type: "image",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "David Green",
    tokens: ["nature", "landscape", "moody"],
    fileUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e",
    fileName: "forest-path.jpg"
  },
  {
    _id: "ref7" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Portrait study",
    type: "image",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "Emma White",
    tokens: ["portrait", "moody", "dark"],
    fileUrl: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39",
    fileName: "portrait-study.jpg"
  },
  {
    _id: "ref8" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Vintage car",
    type: "image",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "Frank Black",
    tokens: ["vintage", "urban", "colorful"],
    fileUrl: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf",
    fileName: "vintage-car.jpg"
  },
  {
    _id: "ref9" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Black and white street",
    type: "image",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "Grace Lee",
    tokens: ["black&white", "urban", "architecture"],
    fileUrl: "https://images.unsplash.com/photo-1445982212798-a6fe24635f9f",
    fileName: "bw-street.jpg"
  },
  {
    _id: "ref10" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Time-lapse city traffic",
    type: "video",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "Henry Park",
    tokens: ["urban", "motion", "modern"],
    fileUrl: "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07",
    fileName: "city-traffic.mp4"
  },
  {
    _id: "ref11" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Aerial drone footage",
    type: "video",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "Ian Brown",
    tokens: ["landscape", "aerial", "nature"],
    fileUrl: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8",
    fileName: "drone-footage.mp4"
  },
  {
    _id: "ref12" as Id<"assets">,
    _creationTime: Date.now(),
    title: "Artistic portrait",
    type: "image",
    userId: "user1",
    createdAt: new Date().toISOString(),
    author: "Julia Red",
    tokens: ["portrait", "artistic", "colorful"],
    fileUrl: "https://images.unsplash.com/photo-1520975661595-6453be3f7070",
    fileName: "artistic-portrait.jpg"
  }
]; 