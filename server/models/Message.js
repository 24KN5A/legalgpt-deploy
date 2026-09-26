import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema({
  document_id: { type: String, default: '' },
  filename: { type: String, default: '' },
  chunk_index: { type: Number, default: 0 },
  text: { type: String, default: '' },
  similarity: { type: Number, default: 0 },
  page_number: { type: Number, default: 1 },
});

const messageSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    sources: [sourceSchema],
    confidence: {
      type: Number,
      default: 0.85,
    },
    match_quality: {
      type: String,
      default: 'High',
    },
    top_similarity: {
      type: Number,
      default: 0.85,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

messageSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj.__v;
  return obj;
};

export const Message = mongoose.model('Message', messageSchema);
