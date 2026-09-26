import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    full_name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password_hash: {
      type: String,
      required: true,
    },
    phone_number: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'lawyer'],
      default: 'user',
    },
    reset_otp: {
      code: { type: String, default: null },
      expires_at: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      verified: { type: Boolean, default: false },
      reset_token: { type: String, default: null },
      reset_token_expires_at: { type: Date, default: null },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj.password_hash;
  delete obj.reset_otp;
  delete obj.__v;
  return obj;
};

export const User = mongoose.model('User', userSchema);
