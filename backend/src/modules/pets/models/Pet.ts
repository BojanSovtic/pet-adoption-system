import mongoose, { Document, Schema } from "mongoose";
import { IUser } from "@/modules/users/models/User";

export interface IPet extends Document {
  // Basic Info
  name: string;
  species: "dog" | "cat" | "bird" | "rabbit" | "other";
  breed?: string;
  age?: number; // in years
  gender: "male" | "female" | "unknown";
  size: "small" | "medium" | "large" | "extra-large";
  color?: string;

  // Description & Story
  description?: string;
  personalityTraits?: string[];

  // Photos
  photos: string[];
  primaryPhoto?: string;

  // Health & Medical
  isVaccinated: boolean;
  isNeutered: boolean;
  healthConditions?: string;

  // Adoption Requirements
  goodWithKids: boolean;
  goodWithPets: boolean;
  requiresYard: boolean;
  adoptionFee?: number;

  // Status & Ownership
  status: "available" | "pending" | "adopted" | "not-available";
  owner: mongoose.Types.ObjectId | IUser;
  adopter?: mongoose.Types.ObjectId | IUser;

  // Location
  location: {
    city: string;
    state: string;
    country?: string;
  };

  // Engagement
  views: number;
  favoritedBy: mongoose.Types.Array<mongoose.Types.ObjectId>;

  // Virtuals
  favoriteCount: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  adoptedAt?: Date;
}

const PetSchema: Schema = new Schema(
  {
    // Basic Info
    name: {
      type: String,
      required: true,
      trim: true,
    },
    species: {
      type: String,
      enum: ["dog", "cat", "bird", "rabbit", "other"],
      required: true,
    },
    breed: {
      type: String,
      trim: true,
    },
    age: {
      type: Number,
      min: 0,
      max: 30,
    },
    gender: {
      type: String,
      enum: ["male", "female", "unknown"],
      default: "unknown",
    },
    size: {
      type: String,
      enum: ["small", "medium", "large", "extra-large"],
      required: true,
    },
    color: {
      type: String,
      trim: true,
    },

    // Description
    description: {
      type: String,
      maxlength: 2000,
    },
    personalityTraits: [
      {
        type: String,
        trim: true,
      },
    ],

    // Photos
    photos: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.length <= 10;
        },
        message: "Cannot upload more than 10 photos",
      },
    },
    primaryPhoto: {
      type: String,
    },

    // Health
    isVaccinated: {
      type: Boolean,
      default: false,
    },
    isNeutered: {
      type: Boolean,
      default: false,
    },
    healthConditions: {
      type: String,
      maxlength: 500,
    },

    // Adoption Requirements
    goodWithKids: {
      type: Boolean,
      default: true,
    },
    goodWithPets: {
      type: Boolean,
      default: true,
    },
    requiresYard: {
      type: Boolean,
      default: false,
    },
    adoptionFee: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Status & Ownership
    status: {
      type: String,
      enum: ["available", "pending", "adopted", "not-available"],
      default: "available",
      index: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    adopter: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    // Location
    location: {
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      country: { type: String, default: "USA", trim: true },
    },

    // Engagement
    views: {
      type: Number,
      default: 0,
    },
    favoritedBy: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },

    // Adoption date
    adoptedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for search and filtering
PetSchema.index({ species: 1, status: 1 });
PetSchema.index({ "location.city": 1, "location.state": 1 });
PetSchema.index({ owner: 1 });
PetSchema.index({ createdAt: -1 });

// Text search index for name, breed, description
PetSchema.index({
  name: "text",
  breed: "text",
  description: "text",
});

// Virtual for favorite count
PetSchema.virtual("favoriteCount").get(function (this: IPet) {
  return this.favoritedBy.length;
});

// Middleware to set adoptedAt date when status changes to 'adopted'
PetSchema.pre("save", function (next) {
  if (
    this.isModified("status") &&
    this.status === "adopted" &&
    !this.adoptedAt
  ) {
    this.adoptedAt = new Date();
  }
  next();
});

export default mongoose.model<IPet>("Pet", PetSchema);
