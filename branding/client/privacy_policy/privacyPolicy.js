import { Template } from 'meteor/templating';
import Branding from '/branding/collection';

Template.privacyPolicy.onCreated(function () {
  // Get reference to template instance
  const instance = this;

  // Subscription to branding collection
  instance.subscribe('branding');
});

Template.privacyPolicy.helpers({
  branding () {
    // Get Branding collection content
    return Branding.findOne();
  },
});