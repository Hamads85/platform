/* Copyright 2017 Apinf Oy
This file is covered by the EUPL license.
You may obtain a copy of the licence at
https://joinup.ec.europa.eu/community/eupl/og_page/european-union-public-licence-eupl-v11 */

// Meteor packages imports
import { Template } from 'meteor/templating';

// Collection imports
import Feedback from '../../collection';

Template.feedbackForm.helpers({
  feedbackCollection () {
    // Return a reference to Feedback collection, for AutoForm
    return Feedback;
  },
});
