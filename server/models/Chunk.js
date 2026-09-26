import mongoose from 'mongoose';

const chunkSchema = new mongoose.Schema(
  {
    document_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    chunk_index: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    page_number: {
      type: Number,
      default: 1,
    },
    token_count: {
      type: Number,
      default: 0,
    },
    embedding: {
      type: [Number],
      default: [],
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

chunkSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj.__v;
  return obj;
};

export const Chunk = mongoose.model('Chunk', chunkSchema);
