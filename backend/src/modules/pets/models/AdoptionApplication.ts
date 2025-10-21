import mongoose, { Document, Schema } from "mongoose";
import { IUser } from "@/modules/users/models/User";
import { IPet } from "@/modules/pets/models/Pet";

export interface IAdoptionApplication extends Document {
  // Core relationships
  applicant: mongoose.Types.ObjectId | IUser;
  pet: mongoose.Types.ObjectId | IPet;
  petOwner: mongoose.Types.ObjectId | IUser; // Shelter or user who posted the pet

  // Application status
  status: "pending" | "approved" | "rejected" | "withdrawn";

  // Applicant information
  applicantInfo: {
    fullName: string;
    email: string;
    phone: string;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    };
  };

  // Living situation
  livingSituation: {
    homeType: "house" | "apartment" | "condo" | "other";
    hasYard: boolean;
    ownOrRent: "own" | "rent";
    landlordAllowsPets?: boolean;
  };

  // Experience & household
  experience: {
    hadPetsBefore: boolean;
    currentPets?: string;
    vetReference?: string;
  };

  household: {
    numberOfAdults: number;
    numberOfChildren: number;
    childrenAges?: string;
  };

  // Application details
  reasonForAdoption: string;
  hoursAlonePerDay?: number;
  activityLevel: "low" | "moderate" | "high";

  // Review
  reviewNotes?: string;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId | IUser;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const AdoptionApplicationSchema: Schema = new Schema(
  {
    // Core relationships
    applicant: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pet: {
      type: Schema.Types.ObjectId,
      ref: "Pet",
      required: true,
      index: true,
    },
    petOwner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "withdrawn"],
      default: "pending",
      index: true,
    },

    // Applicant info
    applicantInfo: {
      fullName: {
        type: String,
        required: true,
        trim: true,
      },
      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
      },
      phone: {
        type: String,
        required: true,
        trim: true,
      },
      address: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, default: "USA" },
      },
    },

    // Living situation
    livingSituation: {
      homeType: {
        type: String,
        enum: ["house", "apartment", "condo", "other"],
        required: true,
      },
      hasYard: {
        type: Boolean,
        default: false,
      },
      ownOrRent: {
        type: String,
        enum: ["own", "rent"],
        required: true,
      },
      landlordAllowsPets: {
        type: Boolean,
      },
    },

    // Experience
    experience: {
      hadPetsBefore: {
        type: Boolean,
        required: true,
      },
      currentPets: {
        type: String,
        maxlength: 500,
      },
      vetReference: {
        type: String,
        maxlength: 200,
      },
    },

    // Household
    household: {
      numberOfAdults: {
        type: Number,
        required: true,
        min: 1,
      },
      numberOfChildren: {
        type: Number,
        default: 0,
        min: 0,
      },
      childrenAges: {
        type: String,
        maxlength: 100,
      },
    },

    // Application details
    reasonForAdoption: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    hoursAlonePerDay: {
      type: Number,
      min: 0,
      max: 24,
    },
    activityLevel: {
      type: String,
      enum: ["low", "moderate", "high"],
      required: true,
    },

    // Review
    reviewNotes: {
      type: String,
      maxlength: 1000,
    },
    reviewedAt: {
      type: Date,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for common queries
AdoptionApplicationSchema.index({ applicant: 1, status: 1 });
AdoptionApplicationSchema.index({ petOwner: 1, status: 1 });
AdoptionApplicationSchema.index({ pet: 1, status: 1 });
AdoptionApplicationSchema.index({ createdAt: -1 });

// Prevent duplicate applications
AdoptionApplicationSchema.index({ applicant: 1, pet: 1 }, { unique: true });

// Middleware to set reviewedAt date when status changes
AdoptionApplicationSchema.pre("save", function (next) {
  if (
    this.isModified("status") &&
    (this.status === "approved" || this.status === "rejected") &&
    !this.reviewedAt
  ) {
    this.reviewedAt = new Date();
  }
  next();
});

export default mongoose.model<IAdoptionApplication>(
  "AdoptionApplication",
  AdoptionApplicationSchema
);
