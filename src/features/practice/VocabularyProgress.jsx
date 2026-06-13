import { Link } from "react-router-dom";
import { getVocabularyStats } from "../../lib/vocabularyEngine.js";
import { IELTS_VOCABULARY } from "../../data/ieltsVocabulary.js";
import SvgIcon from "../../components/SvgIcon.jsx";

/**
 * VocabularyProgress — Compact progress widget.
 * Shows words mastered, completion %, and a link to the vocabulary practice page.
 *
 * Props:
 *   progress - from loadVocabProgress() (optional, loads fresh if not provided)
 */
export default function VocabularyProgress({ progress = null, profileId = null }) {
  const stats = getVocabularyStats(progress || loadVocabProgress(profileId), IELTS_VOCABULARY);

  return (
    <div className="vocab-progress">
      <div className="vocab-progress__header">
        <span className="vocab-progress__icon"><SvgIcon name="book" size={20} /></span>
        <div>
          <h4 className="vocab-progress__title">Vocabulary</h4>
          <span className="vocab-progress__subtitle">
            {stats.totalSeen > 0
              ? `${stats.mastered} mastered · ${stats.percentComplete}% complete`
              : "Start building your academic vocabulary"}
          </span>
        </div>
        <Link to="/practice/vocabulary" className="vocab-progress__link">Study →</Link>
      </div>

      {stats.totalSeen > 0 && (
        <div className="vocab-progress__bar">
          <div
            className="vocab-progress__bar-fill"
            style={{ width: `${stats.percentComplete}%` }}
          />
        </div>
      )}
    </div>
  );
}
