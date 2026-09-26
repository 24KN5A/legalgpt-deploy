import mongoose from 'mongoose';

const clauseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  text: { type: String, required: true },
  risk_level: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
  risk_reason: { type: String, default: '' },
  recommendation: { type: String, default: '' },
  page_number: { type: Number, default: 1 },
});

const analysisSchema = new mongoose.Schema(
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
    },
    executive_summary: {
      type: String,
      default: '',
    },
    overall_risk_score: {
      type: Number, // 0 to 100
      default: 25,
    },
    overall_risk_level: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low',
    },
    key_clauses: [clauseSchema],
    compliance_items: [
      {
        check: String,
        status: { type: String, enum: ['pass', 'warning', 'fail'] },
        note: String,
      },
    ],
    action_items: [
      {
        priority: { type: String, enum: ['high', 'medium', 'low'] },
        action: String,
      },
    ],
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

analysisSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj.__v;
  return obj;
};

export const Analysis = mongoose.model('Analysis', analysisSchema);
