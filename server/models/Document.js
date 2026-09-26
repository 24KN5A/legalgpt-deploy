import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null = shared document
    },
    original_filename: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    content_type: {
      type: String,
      default: 'application/pdf',
    },
    size_bytes: {
      type: Number,
      default: 0,
    },
    page_count: {
      type: Number,
      default: 0,
    },
    chunk_count: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'ready', 'failed'],
      default: 'uploaded',
    },
    error_message: {
      type: String,
      default: null,
    },
    preview_text: {
      type: String,
      default: null,
    },
    summary: {
      type: String,
      default: null,
    },
    risk_level: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical', 'unknown'],
      default: 'unknown',
    },
    extracted_clauses: [
      {
        title: String,
        text: String,
        risk_level: String,
        page_number: Number,
      },
    ],
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

documentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj.__v;
  return obj;
};

export const Document = mongoose.model('Document', documentSchema);
