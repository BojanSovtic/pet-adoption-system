import mongoose, { Document, Schema } from "mongoose";
import { IPet } from "@/modules/pets/models/Pet";

export interface IUser extends Document {
  // Basic Info
  name: string;
  email: string;
  password: string;

  // Profile
  avatar?: string;
  phone?: string;
  bio?: string;

  // Address
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };

  // Role
  role: "user" | "shelter" | "admin";

  // Account status
  isEmailVerified: boolean;
  isActive: boolean;

  // Pet relationships
  pets: mongoose.Types.Array<mongoose.Types.ObjectId | IPet>;
  favoritePets: mongoose.Types.Array<mongoose.Types.ObjectId>;
  adoptionApplications: mongoose.Types.Array<mongoose.Types.ObjectId>;

  // Password reset
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;

  // Virtuals
  petCount: number;
}

const UserSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true, // UNIQUE index, no need to add schema.index
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: { type: String, required: true, minlength: 6, select: false },
    avatar: { type: String, default: null },
    phone: { type: String, trim: true },
    bio: { type: String, maxlength: 500 },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: "Serbia" },
    },
    role: { type: String, enum: ["user", "shelter", "admin"], default: "user" },
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    pets: { type: [Schema.Types.ObjectId], ref: "Pet", default: [] },
    favoritePets: { type: [Schema.Types.ObjectId], ref: "Pet", default: [] },
    adoptionApplications: {
      type: [Schema.Types.ObjectId],
      ref: "AdoptionApplication",
      default: [],
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for role (optional)
UserSchema.index({ role: 1 });

// Virtual for pet count
UserSchema.virtual("petCount").get(function (this: IUser) {
  return this.pets.length;
});

// Transform JSON output
UserSchema.set("toJSON", {
  virtuals: true,
  versionKey: false, // removes __v
  transform: (_doc, ret) => {
    ret.id = ret._id; // keep id if needed
    delete ret._id;
    delete ret.createdAt;
    delete ret.updatedAt;
    return ret;
  },
});

export default mongoose.model<IUser>("User", UserSchema);
