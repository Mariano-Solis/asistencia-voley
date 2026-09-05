import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import DualRoleSelfEnrollment from './DualRoleSelfEnrollment'
import PhotoSourcePicker from './PhotoSourcePicker'
import ProfessorDeleteManager from './ProfessorDeleteManager'
import UXEnhancements from './UXEnhancements'
import WorkflowCore from './WorkflowCore'
import PermissionsEnhancement from './PermissionsEnhancement'
import WorkflowDOMPolish from './WorkflowDOMPolish'
import AdminCollapsibles from './AdminCollapsibles'
import SafePlayerAttendanceFilter from './SafePlayerAttendanceFilter'
import ProfessorTrainingHub from './ProfessorTrainingHub'
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

document.documentElement.style.setProperty('--mgsm-logo-url', `url("${officialLogo}")`)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <DualRoleSelfEnrollment />
    <PhotoSourcePicker />
    <ProfessorDeleteManager />
    <UXEnhancements />
    <WorkflowCore />
    <PermissionsEnhancement />
    <WorkflowDOMPolish />
    <AdminCollapsibles />
    <SafePlayerAttendanceFilter />
    <ProfessorTrainingHub />
    <AdminDualTopbarAction />
  </React.StrictMode>
)
