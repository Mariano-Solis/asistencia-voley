import ReactDOM from 'react-dom/client'
import App from './App'
import DualRoleSelfEnrollment from './DualRoleSelfEnrollment'
import PhotoSourcePicker from './PhotoSourcePicker'
import ProfessorDeleteManager from './ProfessorDeleteManager'
import WorkflowCore from './WorkflowCore'
import PermissionsEnhancement from './PermissionsEnhancement'
import SafePlayerAttendanceFilter from './SafePlayerAttendanceFilter'
import ProfessorTrainingHub from './ProfessorTrainingHub'
import MasterCategoryManager from './MasterCategoryManager'
import PaymentHubStable from './PaymentHubStable'
import AdminDualTopbarAction from './AdminDualTopbarAction'
import officialLogo from '../Logo.jpg'
import './styles.css'
import './mgsm-topbar.css'
import './mgsm-logo-assets.css'
import './mgsm-sidebar-polish.css'
import './mgsm-fixes.css'
import './professor-signup.css'
import './player-self-edit.css'
import './mgsm-actions-polish.css'
import './mgsm-visual-audit.css'
import './mgsm-spacing-hotfix.css'
import './mgsm-workflow-enhancements.css'
import './admin-collapsibles.css'
import './mgsm-player-training.css'
import './mgsm-player-attendance-safe.css'
import './mgsm-final-ui.css'
import './mgsm-professor-modal-stability.css'
import './mgsm-ultra-visual.css'
import './mgsm-ultra-final.css'
import './mgsm-payments.css'
import './mgsm-master-category.css'
import './mgsm-payment-destination.css'
import './mgsm-payments-stable.css'

document.documentElement.style.setProperty('--mgsm-logo-url', `url("${officialLogo}")`)

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <App />
    <DualRoleSelfEnrollment />
    <PhotoSourcePicker />
    <ProfessorDeleteManager />
    <WorkflowCore />
    <PermissionsEnhancement />
    <SafePlayerAttendanceFilter />
    <ProfessorTrainingHub />
    <MasterCategoryManager />
    <PaymentHubStable />
    <AdminDualTopbarAction />
  </>
)
